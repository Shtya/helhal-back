import { Injectable, UnauthorizedException, ConflictException, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, Not } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

import { User, PendingUserRegistration, UserRole, UserStatus, AccountDeactivation, ServiceReview, Order, UserSession, DeviceInfo, SellerLevel, Notification, Setting } from 'entities/global.entity';
import { RegisterDto, LoginDto, VerifyEmailDto, ForgotPasswordDto, ResetPasswordDto } from 'dto/user.dto';
import { ConfigService } from '@nestjs/config';
import { MailService } from 'common/nodemailer';
import { CRUD } from 'common/crud.service';
import { SessionService } from './session.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    public userRepository: Repository<User>,
    @InjectRepository(PendingUserRegistration)
    public pendingUserRepository: Repository<PendingUserRegistration>,
    @InjectRepository(AccountDeactivation) public accountDeactivationRepository: Repository<AccountDeactivation>,
    @InjectRepository(Order) private orderRepository: Repository<Order>,
    @InjectRepository(ServiceReview) private reviewRepository: Repository<ServiceReview>,
    @InjectRepository(UserSession) private sessionsRepo: Repository<UserSession>,
    @InjectRepository(Notification) private notifRepo: Repository<Notification>,
    @InjectRepository(Setting) private settingsRepo: Repository<Setting>,

    public jwtService: JwtService,
    public configService: ConfigService,
    public emailService: MailService,
    public sessionService: SessionService,
  ) { }

  DOCUMENT_EXPIRY_HOURS = 24;
  CODE_EXPIRY_MINUTES = 15;
  RESEND_COOLDOWN_SECONDS = 30;
  PASSWORD_RESET_TOKEN_EXPIRY_MINUTES = 10;
  REFRESH_TOKEN_EXPIRY_DAYS = 7;
  MAX_REFRESH_TOKENS = 5;

  private hash(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async updateStatus(userId: string, status: UserStatus) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.status = status;

    if (status === UserStatus.DELETED) {
      user.deactivatedAt = new Date();

      // Record deactivation reason
      const deactivation = this.accountDeactivationRepository.create({
        user,
        userId: user.id,
        reason: 'User deactivated account',
      });
      await this.accountDeactivationRepository.save(deactivation);
    } else if (status === UserStatus.ACTIVE) {
      user.deactivatedAt = null;
    }

    return this.userRepository.save(user);
  }

  async getAllUsers(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [users, total] = await this.userRepository.findAndCount({
      where: { status: Not(UserStatus.DELETED) },
      skip,
      take: limit,
      order: { created_at: 'DESC' },
      select: ['id', 'username', 'email', 'role', 'status', 'memberSince', 'lastLogin'],
    });

    return {
      users,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async deleteUser(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.status = UserStatus.DELETED;
    user.deactivatedAt = new Date();

    // Record deactivation reason
    const deactivation = this.accountDeactivationRepository.create({
      user,
      userId: user.id,
      reason: 'Deleted by admin',
    });

    await this.accountDeactivationRepository.save(deactivation);
    return this.userRepository.save(user);
  }

  async register(registerDto: RegisterDto) {
    const { username, email, password, role, type, ref: referralCode } = registerDto;

    const existingUser = await this.userRepository.findOne({
      where: [
        { email },
        { username },
      ],
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw new ConflictException('Email already exists');
      } else if (existingUser.username === username) {
        throw new ConflictException('Username already exists');
      }
    }


    const pendingUser = await this.pendingUserRepository.findOne({ where: { email } });
    const currentTimestamp = Date.now();

    if (pendingUser) {
      const lastSentTime = pendingUser.lastSentAt.getTime();
      const timeElapsedSeconds = (currentTimestamp - lastSentTime) / 1000;

      if (timeElapsedSeconds < this.RESEND_COOLDOWN_SECONDS) {
        const remainingSeconds = Math.ceil(this.RESEND_COOLDOWN_SECONDS - timeElapsedSeconds);
        const remainingMinutes = Math.ceil(remainingSeconds / 60);
        throw new ForbiddenException(`Please wait ${remainingMinutes} minutes before resending email`);
      }
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const documentExpiresAt = new Date(currentTimestamp + this.DOCUMENT_EXPIRY_HOURS * 60 * 60 * 1000);
    const codeExpiresAt = new Date(currentTimestamp + this.CODE_EXPIRY_MINUTES * 60 * 1000);

    if (role === UserRole.ADMIN) {
      throw new ForbiddenException('You cannot assign yourself as admin');
    }

    if (pendingUser) {
      pendingUser.type = type;

      pendingUser.username = username;
      pendingUser.passwordHash = await bcrypt.hash(password, 12);
      pendingUser.verificationCode = verificationCode;
      pendingUser.codeExpiresAt = codeExpiresAt;
      pendingUser.lastSentAt = new Date(currentTimestamp);
      pendingUser.expiresAt = documentExpiresAt;
      pendingUser.referralCodeUsed = referralCode;
      pendingUser.role = role;

      await this.pendingUserRepository.save(pendingUser);
    } else {
      const newPendingUser = this.pendingUserRepository.create({
        username,
        email,
        type,
        passwordHash: await bcrypt.hash(password, 12),
        verificationCode,
        expiresAt: documentExpiresAt,
        codeExpiresAt,
        lastSentAt: new Date(currentTimestamp),
        referralCodeUsed: referralCode,
        role,
      });

      await this.pendingUserRepository.save(newPendingUser);
    }



    await this.emailService.sendVerificationEmail(email, verificationCode, username);

    return { message: 'Verification code sent', email };
  }

  async verifyEmail(verifyEmailDto: VerifyEmailDto, res: Response) {
    const { email, code } = verifyEmailDto;

    const pendingUser = await this.pendingUserRepository.findOne({ where: { email } });
    if (!pendingUser) {
      throw new NotFoundException('No active registration found for this email');
    }

    if (pendingUser.verificationCode !== code) {
      throw new BadRequestException('Invalid verification code');
    }

    if (new Date() > pendingUser.codeExpiresAt) {
      throw new BadRequestException('Verification code has expired');
    }

    const { username, email: userEmail, passwordHash, referralCodeUsed, role } = pendingUser;

    const finalRole = role === UserRole.ADMIN ? UserRole.BUYER : role;

    // Generate referral code for new user
    const referralCode = crypto.randomBytes(8).toString('hex').toUpperCase();

    const user = this.userRepository.create({
      username,
      email: userEmail,
      password: passwordHash,
      type: pendingUser.type,
      role: finalRole,
      referralCode,
    });

    await this.userRepository.save(user);

    if (referralCodeUsed) {
      await this.processReferral(user, referralCodeUsed);
    }

    await this.pendingUserRepository.delete(pendingUser.id);

    const serializedUser = await this.authenticateUser(user, res);

    return {
      message: 'Email verified and registration complete',
      user: serializedUser,
    };
  }

  async processReferral(newUser: User, referralCodeUsed: string): Promise<void> {
    if (!referralCodeUsed) return;

    const referrerUser = await this.userRepository.findOne({ where: { referralCode: referralCodeUsed } });
    if (!referrerUser) return;

    newUser.referredBy = referrerUser;
    newUser.referredById = referrerUser.id;
    referrerUser.referralCount = (referrerUser.referralCount || 0) + 1;
    referrerUser.referralRewardsCount = (referrerUser.referralRewardsCount || 0) + 1;
    await this.userRepository.save([newUser, referrerUser]);

    // 🔔 Notify referral owner
    await this.notifRepo.save(
      this.notifRepo.create({
        userId: referrerUser.id,
        type: 'referral_signup',
        title: 'New referral signup',
        message: `User "${newUser.username}" signed up using your referral code!`,
        relatedEntityType: 'user', // or 'referral'
        relatedEntityId: referrerUser.id,
        isRead: false,
      }),
    );
  }

  async resendVerificationEmail(email: string) {
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const pendingUser = await this.pendingUserRepository.findOne({ where: { email } });
    if (!pendingUser) {
      throw new NotFoundException('No active registration found for this email');
    }

    const currentTimestamp = Date.now();
    const lastSentTime = pendingUser.lastSentAt.getTime();
    const timeElapsedSeconds = (currentTimestamp - lastSentTime) / 1000;

    if (timeElapsedSeconds < this.RESEND_COOLDOWN_SECONDS) {
      const remainingSeconds = Math.ceil(this.RESEND_COOLDOWN_SECONDS - timeElapsedSeconds);
      throw new ForbiddenException(`Please wait ${remainingSeconds} minutes before resending email`);
    }

    const newVerificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const newDocumentExpiresAt = new Date(currentTimestamp + this.DOCUMENT_EXPIRY_HOURS * 60 * 60 * 1000);
    const newCodeExpiresAt = new Date(currentTimestamp + this.CODE_EXPIRY_MINUTES * 60 * 1000);

    pendingUser.verificationCode = newVerificationCode;
    pendingUser.codeExpiresAt = newCodeExpiresAt;
    pendingUser.lastSentAt = new Date(currentTimestamp);
    pendingUser.expiresAt = newDocumentExpiresAt;

    await this.pendingUserRepository.save(pendingUser);
    await this.emailService.sendVerificationEmail(email, newVerificationCode, pendingUser.username);

    return { message: 'New verification email sent', email };
  }

  async login(loginDto: LoginDto, res: Response, req) {
    const { email, password } = loginDto;

    const user = await this.userRepository.createQueryBuilder('user').addSelect('user.password').leftJoinAndSelect('user.country', 'country').where('user.email = :email', { email }).andWhere('user.status != :deleted', { deleted: UserStatus.DELETED }).getOne();
    if (!user || !(await user.comparePassword(password))) {
      throw new UnauthorizedException('Incorrect email or password');
    }

    if (user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedException('Your account is inactive. Please contact support or reactivate your account to continue.');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Your account has been suspended. Please contact support.');
    }

    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new UnauthorizedException('Please verify your email before logging in');
    }


    user.lastLogin = new Date();
    const deviceInfo = await this.sessionService.getDeviceInfoFromRequest(req);
    await this.sessionService.trackDevice(user.id, deviceInfo);
    await this.userRepository.save(user);

    // 1) create a new DB session
    const session = this.sessionsRepo.create({
      userId: user.id,
      ipAddress: deviceInfo.ip_address,
      userAgent: req.headers['user-agent'] || '',
      deviceType: deviceInfo.device_type,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      lastActivity: new Date(),
      revokedAt: null,
    });
    await this.sessionsRepo.save(session);

    // 2) issue tokens embedding sid
    const accessToken = this.jwtService.sign({ id: user.id, sid: session.id }, { secret: process.env.JWT_SECRET, expiresIn: process.env.JWT_EXPIRE });
    const refreshToken = this.jwtService.sign({ id: user.id, sid: session.id }, { secret: process.env.JWT_REFRESH, expiresIn: process.env.JWT_REFRESH_EXPIRE });

    // 3) store refresh token hash on the session (for rotation & revocation)
    await this.sessionsRepo.update(session.id, { refreshTokenHash: this.hash(refreshToken) });

    res.locals.accessToken = accessToken;
    res.locals.refreshToken = refreshToken;

    // return serialized user + current session id (optional for UI)
    const serialized = this.serializeUser({ ...user, accessToken, refreshToken, currentDeviceId: session.id });
    return { accessToken, refreshToken, user: serialized };
  }

  async getCurrentUser(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['referredBy', 'country'],
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return this.serializeUser(user);
  }
  async getUserInfo(userId: string) {
    const qb = this.userRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.country', 'country')
      .where('user.id = :userId', { userId });

    // Conditionally join and order by created_at, limit to 10
    qb.leftJoinAndSelect(
      'user.services',
      'services',
      "user.role != 'buyer'"
    ).orderBy('services.created_at', 'DESC')
      .limit(10);

    qb.leftJoinAndSelect(
      'user.jobs',
      'jobs',
      "user.role = 'buyer'"
    ).orderBy('jobs.created_at', 'DESC')
      .limit(10);

    const user = await qb.getOne();

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.serializeUser(user);

  }

  async refreshTokens(refreshToken: string) {
    let decoded: { id: string; sid: string };
    try {
      decoded = this.jwtService.verify(refreshToken, { secret: this.configService.get('JWT_REFRESH') }) as any;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const session = await this.sessionsRepo.findOne({ where: { id: decoded.sid, userId: decoded.id } });
    if (!session || session.revokedAt) {
      throw new UnauthorizedException('Session revoked');
    }
    // check token matches hash
    const incomingHash = this.hash(refreshToken);
    if (!session.refreshTokenHash || session.refreshTokenHash !== incomingHash) {
      throw new UnauthorizedException('Refresh token mismatch');
    }

    // rotate both tokens
    const newAccess = this.jwtService.sign(
      { id: decoded.id, sid: decoded.sid },
      {
        secret: this.configService.get('JWT_SECRET'),
        expiresIn: process.env.JWT_EXPIRE,
      },
    );
    const newRefresh = this.jwtService.sign(
      { id: decoded.id, sid: decoded.sid },
      {
        secret: this.configService.get('JWT_REFRESH'),
        expiresIn: process.env.JWT_REFRESH_EXPIRE,
      },
    );

    await this.sessionsRepo.update(session.id, {
      lastActivity: new Date(),
      refreshTokenHash: this.hash(newRefresh),
    });

    return { message: 'Tokens refreshed successfully', accessToken: newAccess, refreshToken: newRefresh };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      return { message: 'OTP sent if account exists' };
    }

    if (user.resetPasswordExpires) {
      const currentTimestamp = Date.now();
      const lastSentTime = user.lastResetPasswordSentAt.getTime();
      const timeElapsedSeconds = (currentTimestamp - lastSentTime) / 1000;

      if (timeElapsedSeconds < this.RESEND_COOLDOWN_SECONDS) {
        const remainingSeconds = Math.ceil(this.RESEND_COOLDOWN_SECONDS - timeElapsedSeconds);
        throw new ForbiddenException(`Please wait ${remainingSeconds} minutes before resending email`);
      }

    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.lastResetPasswordSentAt = new Date();
    user.resetPasswordToken = otp;
    user.resetPasswordExpires = new Date(Date.now() + this.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);

    await this.userRepository.save(user);

    await this.emailService.sendPasswordResetOtp(user.email, user.username, otp);

    return { message: 'Password reset OTP sent' };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { email, otp, newPassword } = resetPasswordDto;

    const user = await this.userRepository.createQueryBuilder('user').where('user.email = :email', { email }).andWhere('user.resetPasswordToken = :token', { token: otp }).andWhere('user.resetPasswordExpires > :now', { now: new Date() }).getOne();

    if (!user) {
      throw new BadRequestException('Invalid email or OTP, or OTP has expired');
    }


    user.password = newPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;

    await this.userRepository.save(user);

    // Get admin/contact email from settings
    const settings = await this.settingsRepo.findOne({ where: {} });
    const adminEmail = settings?.contactEmail || process.env.ADMIN_EMAIL;

    // Send password change notification to the user
    await this.emailService.sendPasswordChangeNotification(user.email, user.username, adminEmail);

    return { message: 'Password successfully reset' };
  }

  private async createSession(
    user: User,
    opts?: {
      deviceId?: string | null;
      deviceInfo?: Partial<DeviceInfo>;
      userAgent?: string | null;
      ip?: string | null;
    },
  ): Promise<UserSession> {
    const di = opts?.deviceInfo ?? {};
    const s = this.sessionsRepo.create({
      userId: user.id,
      deviceId: opts?.deviceId ?? null,
      userAgent: opts?.userAgent ?? null,
      ipAddress: opts?.ip ?? null,
      deviceType: di.device_type ?? null,
      browser: di.browser ?? null,
      os: di.os ?? null,
      lastActivity: new Date(),
      revokedAt: null,
    });
    return this.sessionsRepo.save(s);
  }

  async authenticateUser(user: User, res: Response, ctx?: { deviceId?: string; deviceInfo?: Partial<DeviceInfo>; ip?: string; userAgent?: string }) {
    const session = await this.createSession(user, {
      deviceId: ctx?.deviceId ?? null,
      deviceInfo: ctx?.deviceInfo ?? {},
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    });

    const accessToken = this.jwtService.sign({ id: user.id, sid: session.id }, { secret: process.env.JWT_SECRET, expiresIn: process.env.JWT_EXPIRE });
    const refreshToken = this.jwtService.sign({ id: user.id, sid: session.id }, { secret: process.env.JWT_REFRESH, expiresIn: process.env.JWT_REFRESH_EXPIRE });

    await this.sessionsRepo.update(session.id, { refreshTokenHash: this.hash(refreshToken) });

    res.locals.accessToken = accessToken;
    res.locals.refreshToken = refreshToken;

    // NOTE: return the real session id
    return this.serializeUser({ ...user, accessToken, refreshToken, currentDeviceId: session.id });
  }

  serializeUser(user: any) {
    return {
      ...user,
      referredBy: user.referredBy ? { id: user.referredBy.id, username: user.referredBy.username } : null,
    };
  }

  clearTokenCookies(res: Response) {
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
  }

  async getUserProfile(userId: string) {
    // single source of truth: User table
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'username', 'email', 'phone', 'profileImage', 'role', 'status', 'description', 'languages', 'skills', 'education', 'certifications', 'introVideoUrl', 'portfolioItems', 'memberSince', 'lastLogin', 'portfolioFile', 'responseTime', 'deliveryTime', 'ageGroup', 'revisions', 'sellerLevel', 'lastActivity', 'preferences', 'balance', 'totalSpent', 'totalEarned', 'reputationPoints'],
      relations: ['country']
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, updateData: Partial<User>) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const allowedFields: (keyof User)[] = ['profileImage', 'username', 'phone', 'description', 'languages', 'skills', 'education', 'certifications', 'deliveryTime', 'ageGroup', 'revisions', 'preferences', 'type', 'countryId'];

    if (typeof updateData.email !== 'undefined' && updateData.email !== user.email) {
      const exists = await this.userRepository.findOne({ where: { email: updateData.email } });
      if (exists) throw new ConflictException('Email already in use');
      user.email = updateData.email!;
    }

    for (const f of allowedFields) {
      if (f !== 'email' && typeof (updateData as any)[f] !== 'undefined') {
        (user as any)[f] = (updateData as any)[f];
      }
    }
    return this.userRepository.save(user);
  }

  async updateSkills(userId: string, skills: string[]) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.skills = skills || [];
    return this.userRepository.save(user);
  }

  async getProfileStats(userId: any) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Orders completed as seller
    const ordersCompleted = await this.orderRepository.count({
      where: { sellerId: userId, status: 'Completed' as any },
    });

    const repeatBuyersRaw = await this.orderRepository.createQueryBuilder('order').select('COUNT(DISTINCT order.buyerId)', 'count').where('order.sellerId = :userId', { userId }).andWhere('order.status = :status', { status: 'Completed' }).getRawOne<{ count: string }>();

    const avgRatingRaw = await this.reviewRepository.createQueryBuilder('review').select('AVG(review.rating)', 'average').where('review.sellerId = :userId', { userId }).getRawOne<{ average: string }>();

    const repeatBuyers = parseInt(repeatBuyersRaw?.count || '0', 10) || 0;
    const averageRating = parseFloat(avgRatingRaw?.average || '0') || 0;
    const topRated = averageRating >= 4.5;

    // Return full profile + computed stats
    const profile = await this.getUserProfile(userId);
    return { ...profile, ordersCompleted, repeatBuyers, averageRating, topRated } as any;
  }

  async updateSellerLevel(userId: string) {
    const stats = await this.getProfileStats(userId);
    let sellerLevel = SellerLevel.LVL1;
    if (stats.ordersCompleted >= 50 && stats.averageRating >= 4.8)
      sellerLevel = SellerLevel.TOP; // Top
    else if (stats.ordersCompleted >= 20 && stats.averageRating >= 4.5) SellerLevel.LVL2;

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.sellerLevel = sellerLevel;
    user.topRated = sellerLevel === SellerLevel.TOP;
    return this.userRepository.save(user);
  }

  async deactivateAccount(userId: string, reason: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.status === UserStatus.INACTIVE) {
      throw new ConflictException('Account already deactivated');
    }

    // Create deactivation record
    const deactivation = this.accountDeactivationRepository.create({
      userId,
      reason,
      user,
    });

    // Update user status
    user.status = UserStatus.INACTIVE;
    user.deactivatedAt = new Date();

    await this.userRepository.save(user);
    await this.accountDeactivationRepository.save(deactivation);

    return { message: 'Account deactivated successfully' };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userRepository.createQueryBuilder('user').addSelect('user.password').where('user.id = :id', { id: userId }).getOne();

    if (!user) throw new NotFoundException('User not found');
    const ok = await user.comparePassword(currentPassword);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');
    user.password = newPassword; // your entity hook hashes on save (existing logic)
    await this.userRepository.save(user);
    return { message: 'Password changed successfully' };
  }

  // auth.service.ts
  async logoutSession(userId: string, sessionId: string) {
    const session = await this.sessionsRepo.findOne({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException('Session not found');
    if (!session.revokedAt) {
      session.revokedAt = new Date();
      session.refreshTokenHash = null;
      await this.sessionsRepo.save(session);
    }
    return { message: 'Session revoked', id: sessionId };
  }
  async getSessionsForUser(userId: string, opts?: { activeOnly?: boolean }) {
    const rows = await this.sessionsRepo.find({
      where: { userId },
      order: { created_at: 'DESC' },
      select: ['id', 'userId', 'ipAddress', 'userAgent', 'deviceType', 'browser', 'os', 'lastActivity', 'revokedAt', 'created_at'],
    });
    return opts?.activeOnly ? rows.filter(r => !r.revokedAt) : rows;
  }
  async logoutAllExcept(userId: string, keepSessionId?: string) {
    const qb = this.sessionsRepo
      .createQueryBuilder()
      .update(UserSession)
      .set({ revokedAt: () => 'NOW()', refreshTokenHash: null })
      .where('"user_id" = :uid', { uid: userId });
    if (keepSessionId) qb.andWhere('"id" != :sid', { sid: keepSessionId });
    await qb.execute();
    return { message: keepSessionId ? 'Other sessions revoked' : 'All sessions revoked' };
  }
}
