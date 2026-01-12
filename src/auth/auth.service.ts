import { Injectable, UnauthorizedException, ConflictException, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, Not } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

import { User, PendingUserRegistration, UserRole, UserStatus, AccountDeactivation, ServiceReview, Order, UserSession, DeviceInfo, SellerLevel, Notification, Setting, UserRelatedAccount, PendingPhoneRegistration } from 'entities/global.entity';
import { RegisterDto, LoginDto, VerifyEmailDto, ForgotPasswordDto, ResetPasswordDto, UpdateUserPermissionsDto, PhoneRegisterDto } from 'dto/user.dto';
import { ConfigService } from '@nestjs/config';
import { MailService } from 'common/nodemailer';
import { SessionService } from './session.service';
import { PermissionDomains } from 'entities/permissions';
import { SmsService } from 'common/sms-service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    public userRepository: Repository<User>,

    @InjectRepository(UserRelatedAccount)
    public userAccountsRepo: Repository<UserRelatedAccount>,

    @InjectRepository(PendingUserRegistration)
    public pendingUserRepository: Repository<PendingUserRegistration>,
    @InjectRepository(PendingPhoneRegistration)
    public pendingPhoneRepository: Repository<PendingPhoneRegistration>,
    @InjectRepository(AccountDeactivation) public accountDeactivationRepository: Repository<AccountDeactivation>,
    @InjectRepository(Order) private orderRepository: Repository<Order>,
    @InjectRepository(ServiceReview) private reviewRepository: Repository<ServiceReview>,
    @InjectRepository(UserSession) private sessionsRepo: Repository<UserSession>,
    @InjectRepository(Notification) private notifRepo: Repository<Notification>,
    @InjectRepository(Setting) private settingsRepo: Repository<Setting>,

    public jwtService: JwtService,
    public configService: ConfigService,
    public emailService: MailService,
    public smsService: SmsService,
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

    if (pendingUser && pendingUser?.lastSentAt) {
      const lastSentTime = pendingUser.lastSentAt.getTime();
      const timeElapsedSeconds = (currentTimestamp - lastSentTime) / 1000;

      if (timeElapsedSeconds < this.RESEND_COOLDOWN_SECONDS) {
        const remainingSeconds = Math.ceil(this.RESEND_COOLDOWN_SECONDS - timeElapsedSeconds);
        const remainingMinutes = Math.ceil(remainingSeconds / 60);
        throw new ForbiddenException(`Please wait ${remainingMinutes} minutes before resending email`);
      }
    }

    const verificationCode = this.generateOTP();
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

    const serializedUser = await this.authenticateUser({ ...user, permissions: null } as User, res);


    const emailPromises = [
      this.emailService.sendWelcomeEmail(user.email, user.username, user.role)
    ];


    if (user.role === 'seller') {
      emailPromises.push(
        this.emailService.sendSellerFeePolicyEmail(user.email, user.username)
      );
    }

    try {
      await Promise.all(emailPromises)

    } catch (err) {
      console.error('Failed to send onboarding emails:', err);
    }

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

    if (!pendingUser?.lastSentAt) {

      const lastSentTime = pendingUser.lastSentAt.getTime();
      const timeElapsedSeconds = (currentTimestamp - lastSentTime) / 1000;

      if (timeElapsedSeconds < this.RESEND_COOLDOWN_SECONDS) {
        const remainingSeconds = Math.ceil(this.RESEND_COOLDOWN_SECONDS - timeElapsedSeconds);
        throw new ForbiddenException(`Please wait ${remainingSeconds} minutes before resending email`);
      }
    }

    const newVerificationCode = this.generateOTP();
    const newDocumentExpiresAt = new Date(currentTimestamp + this.DOCUMENT_EXPIRY_HOURS * 60 * 60 * 1000);
    const newCodeExpiresAt = new Date(currentTimestamp + this.CODE_EXPIRY_MINUTES * 60 * 1000);

    pendingUser.verificationCode = newVerificationCode;
    pendingUser.codeExpiresAt = newCodeExpiresAt;
    pendingUser.lastSentAt = new Date(currentTimestamp);
    pendingUser.expiresAt = newDocumentExpiresAt;

    await this.pendingUserRepository.save(pendingUser);

    return { message: 'New verification email sent', email };
  }

  async login(loginDto: LoginDto, res: Response, req) {
    const { email, password } = loginDto;

    const user = await this.userRepository.createQueryBuilder('user').addSelect('user.password').addSelect('user.permissions').leftJoinAndSelect('user.country', 'country').where('user.email = :email', { email }).getOne();
    if (!user || !(await user.comparePassword(password))) {
      throw new UnauthorizedException('Incorrect email or password');
    }

    await this.emailService.sendSellerFeePolicyEmail(user.email, user.username);

    if (user.status === UserStatus.INACTIVE || user.status === UserStatus.DELETED) {
      throw new UnauthorizedException('Your account is inactive. Please contact support.');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Your account has been suspended. Please contact support.');
    }

    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new UnauthorizedException('Please verify your email before logging in');
    }

    return await this.generateTokens(user, res, req)
  }

  private async generateTokens(user, res: Response, req) {

    user.lastLogin = new Date();
    const deviceInfo = await this.sessionService.getDeviceInfoFromRequest(req);
    await this.sessionService.trackDevice(user.id, deviceInfo);
    await this.userRepository.save(user);

    // 1) create a new DB session
    const session = await this.createSession(user, {
      deviceInfo: deviceInfo,
      ip: deviceInfo.ip_address,
      userAgent: req.headers['user-agent'] ?? null,
    });


    await this.sessionsRepo.save(session);

    // 2) issue tokens embedding sid
    const accessToken = this.jwtService.sign({ id: user.id, sid: session.id, role: user.role, permissions: user.permissions }, { secret: process.env.JWT_SECRET, expiresIn: process.env.JWT_EXPIRE });
    const refreshToken = this.jwtService.sign({ id: user.id, sid: session.id, role: user.role, permissions: user.permissions }, { secret: process.env.JWT_REFRESH, expiresIn: process.env.JWT_REFRESH_EXPIRE });

    // 3) store refresh token hash on the session (for rotation & revocation)
    await this.sessionsRepo.update(session.id, { refreshTokenHash: this.hash(refreshToken) });

    res.locals.accessToken = accessToken;
    res.locals.refreshToken = refreshToken;
    const relatedUsers = await this.getRelatedUsers(user.id);

    // return serialized user + current session id (optional for UI)
    const serialized = this.serializeUser({ ...user, relatedUsers, accessToken, refreshToken, currentDeviceId: session.id });
    return { accessToken, refreshToken, user: serialized };
  }


  async getCurrentUser(userId: string) {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.referredBy', 'referredBy')
      .leftJoinAndSelect('user.country', 'country')
      .addSelect('user.permissions') // ✅ تضمين عمود الصلاحيات
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const relatedUsers = await this.getRelatedUsers(user.id);

    return this.serializeUser({
      ...user,
      relatedUsers,
      permissions: user.permissions,
    });
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

    const relatedUsers = await this.getRelatedUsers(user.id);

    return this.serializeUser({ ...user, relatedUsers });

  }

  async refreshTokens(refreshToken: string) {
    let decoded: { id: string; sid: string };
    try {
      decoded = this.jwtService.verify(refreshToken, { secret: this.configService.get('JWT_REFRESH') }) as any;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.permissions')
      .where('user.id = :id', { id: decoded.id })
      .getOne();


    if (!user) {
      throw new UnauthorizedException('User not found');
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
      { id: decoded.id, sid: decoded.sid, role: user.role, permissions: user.permissions },
      {
        secret: this.configService.get('JWT_SECRET'),
        expiresIn: process.env.JWT_EXPIRE,
      },
    );
    const newRefresh = this.jwtService.sign(
      { id: decoded.id, sid: decoded.sid, role: user.role, permissions: user.permissions },
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

    if (user.resetPasswordExpires && user?.lastResetPasswordSentAt) {
      const currentTimestamp = Date.now();
      const lastSentTime = user.lastResetPasswordSentAt.getTime();
      const timeElapsedSeconds = (currentTimestamp - lastSentTime) / 1000;

      if (timeElapsedSeconds < this.RESEND_COOLDOWN_SECONDS) {
        const remainingSeconds = Math.ceil(this.RESEND_COOLDOWN_SECONDS - timeElapsedSeconds);
        throw new ForbiddenException(`Please wait ${remainingSeconds} minutes before resending email`);
      }

    }

    const otp = this.generateOTP();

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

    const accessToken = this.jwtService.sign({ id: user.id, sid: session.id, role: user.role, permissions: user.permissions }, { secret: process.env.JWT_SECRET, expiresIn: process.env.JWT_EXPIRE });
    const refreshToken = this.jwtService.sign({ id: user.id, sid: session.id, role: user.role, permissions: user.permissions }, { secret: process.env.JWT_REFRESH, expiresIn: process.env.JWT_REFRESH_EXPIRE });

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
      select: ['countryCode', 'id', 'username', 'email', 'phone', 'profileImage', 'role', 'status', 'description', 'languages', 'skills', 'education', 'certifications', 'introVideoUrl', 'portfolioItems', 'memberSince', 'lastLogin', 'portfolioFile', 'responseTime', 'deliveryTime', 'ageGroup', 'revisions', 'sellerLevel', 'lastActivity', 'preferences', 'balance', 'totalSpent', 'totalEarned', 'reputationPoints'],
      relations: ['country']
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, updateData: Partial<User>, adminId?: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const isAdmin = !!adminId;
    if (isAdmin && user.role === UserRole.ADMIN && user.id != adminId) {
      throw new ForbiddenException("You cannot update another admin's profile");
    }

    const allowedFields: (keyof User)[] = ['countryCode', 'profileImage', 'username', 'phone', 'description', 'languages', 'skills', 'education', 'certifications', 'deliveryTime', 'ageGroup', 'revisions', 'preferences', 'type', 'countryId'];

    if (typeof updateData.email !== 'undefined' && updateData.email !== user.email) {
      const exists = await this.userRepository.findOne({ where: { email: updateData.email } });
      if (exists) throw new ConflictException('Email already in use');
      user.email = updateData.email!;
    }

    // ✅ Username update check
    if (
      updateData.username && typeof updateData.username !== 'undefined' &&
      updateData.username !== user.username
    ) {
      const usernameExists = await this.userRepository.findOne({
        where: { username: updateData.username },
      });

      if (usernameExists) {
        throw new ConflictException('Username already taken');
      }

      user.username = updateData.username;
    }

    if (
      updateData.phone &&
      updateData.countryCode &&
      (
        updateData.phone !== user.phone ||
        JSON.stringify(updateData.countryCode) !== JSON.stringify(user.countryCode)
      )
    ) {
      const exists = await this.userRepository
        .createQueryBuilder('u')
        .where('u.phone = :phone', { phone: updateData.phone })
        .andWhere('u."countryCode" @> :countryCode', {
          countryCode: JSON.stringify(updateData.countryCode),
        })
        .andWhere('u.id != :id', { id: user.id })
        .getOne();

      if (exists) {
        throw new ConflictException('Phone number with this country code already in use');
      }

      user.phone = updateData.phone;
      user.countryCode = updateData.countryCode;
      user.isPhoneVerified = false;
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

  async updateSellerLevelAutomatically(userId: string) {
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

  async updateSellerLevel(userId: string, level: SellerLevel, adminId) {
    // Validate the level
    if (!Object.values(SellerLevel).includes(level)) {
      throw new BadRequestException(`Invalid seller level: ${level}`);
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User with ID ${userId} not found`);


    // Optional: prevent changing other admins
    if (user.role === UserRole.ADMIN && user.id !== adminId) {
      throw new BadRequestException(`Cannot change seller level for another admin`);
    }

    user.sellerLevel = level;
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

    // Get admin/contact email from settings
    const settings = await this.settingsRepo.findOne({ where: {} });
    const adminEmail = settings?.contactEmail || process.env.ADMIN_EMAIL;

    // Send password change notification to the user
    await this.emailService.sendPasswordChangeNotification(user.email, user.username, adminEmail);

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
  // auth.service.ts
  async getSessionsForUser(
    userId: string,
    opts?: { activeOnly?: boolean; cursor?: string; limit?: number }
  ) {
    const qb = this.sessionsRepo
      .createQueryBuilder('s')
      .where('s.userId = :userId', { userId })
      .orderBy('s.created_at', 'DESC')
      .limit(opts?.limit ?? 50);

    // Apply cursor
    if (opts?.cursor) {
      qb.andWhere('s.created_at < :cursorDate', {
        cursorDate: new Date(opts.cursor),
      });
    }

    // Active-only filter
    if (opts?.activeOnly) {
      qb.andWhere('s.revokedAt IS NULL');
    }

    const rows = await qb.getMany();

    // New cursor → last item timestamp
    const nextCursor = rows.length > 0 ? rows[rows.length - 1].created_at : null;

    return {
      data: rows,
      nextCursor,
      hasMore: !!nextCursor,
    };
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


  async requestEmailChange(userId: string, newEmail: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Check if new email is already used
    const emailExists = await this.userRepository.findOne({
      where: { email: newEmail },
      select: [
        'id',
        'username',
        'email',
        'pendingEmail',
        'pendingEmailCode',
        'lastEmailChangeSentAt',
      ],
    });
    if (emailExists) throw new BadRequestException('Email already in use');

    // Cooldown check
    if (user.lastEmailChangeSentAt) {
      const currentTimestamp = Date.now();
      const lastSentTime = user.lastEmailChangeSentAt.getTime();
      const timeElapsedSeconds = (currentTimestamp - lastSentTime) / 1000;

      if (timeElapsedSeconds < this.RESEND_COOLDOWN_SECONDS) {
        const remainingSeconds = Math.ceil(this.RESEND_COOLDOWN_SECONDS - timeElapsedSeconds);
        throw new ForbiddenException(`Please wait ${remainingSeconds} seconds before resending email`);
      }
    }

    // Update last sent timestamp
    const code = this.generateOTP();

    user.lastEmailChangeSentAt = new Date();
    user.pendingEmail = newEmail;
    user.pendingEmailCode = code;

    await this.userRepository.save(user);

    // Send confirmation email
    await this.emailService.sendEmailChangeConfirmation(newEmail, user.username, user.id, code);

    return { message: 'Confirmation email sent to new email address' };
  }

  async resendEmailConfirmation(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId }, select: [
        'id',
        'username',
        'email',
        'pendingEmail',
        'pendingEmailCode',
        'lastEmailChangeSentAt',
      ],
    });
    if (!user || !user.pendingEmail || !user.pendingEmailCode) {
      throw new BadRequestException('No pending email change found');
    }

    // Cooldown check
    if (user.lastEmailChangeSentAt) {
      const currentTimestamp = Date.now();
      const lastSentTime = user.lastEmailChangeSentAt.getTime();
      const timeElapsedSeconds = (currentTimestamp - lastSentTime) / 1000;

      if (timeElapsedSeconds < this.RESEND_COOLDOWN_SECONDS) {
        const remainingSeconds = Math.ceil(this.RESEND_COOLDOWN_SECONDS - timeElapsedSeconds);
        throw new ForbiddenException(`Please wait ${remainingSeconds} seconds before resending email`);
      }
    }

    user.lastEmailChangeSentAt = new Date()

    await this.userRepository.save(user);

    await this.emailService.sendEmailChangeConfirmation(
      user.pendingEmail,
      user.username,
      user.id,
      user.pendingEmailCode
    );

    return { message: 'Confirmation email resent' };
  }

  async cancelEmailChange(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId }, select: [
        'id',
        'username',
        'email',
        'pendingEmail',
        'pendingEmailCode',
        'lastEmailChangeSentAt',
      ],
    });
    if (!user) throw new NotFoundException('User not found');

    user.pendingEmail = null;
    user.pendingEmailCode = null;
    user.lastEmailChangeSentAt = null;

    await this.userRepository.save(user);
    return { message: 'Pending email change canceled' };
  }

  async confirmEmailChange(userId: string, pendingEmail: string, code: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId }, select: [
        'id',
        'username',
        'email',
        'pendingEmail',
        'pendingEmailCode',
        'lastEmailChangeSentAt',
      ],
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.pendingEmail !== pendingEmail || user.pendingEmailCode !== code) {
      throw new BadRequestException('Invalid code or pending email');
    }

    // Check if email is now used
    const emailExists = await this.userRepository.findOne({ where: { email: pendingEmail } });
    if (emailExists) throw new BadRequestException('Email already in use');

    const oldEmail = user.email;
    user.email = pendingEmail;
    user.pendingEmail = null;
    user.pendingEmailCode = null;
    user.lastEmailChangeSentAt = null;

    await this.userRepository.save(user);
    // Get admin/contact email from settings
    const settings = await this.settingsRepo.findOne({ where: {} });
    const adminEmail = settings?.contactEmail || process.env.ADMIN_EMAIL;

    // Send password change notification to the user
    await this.emailService.sendEmailChangeNotification(oldEmail, user.username, adminEmail);
    return { message: 'Email successfully updated' };
  }

  async getFirstAdmin() {
    const admin = await this.userRepository.findOne({
      where: { role: 'admin' },
      order: { created_at: 'ASC' }, // get the earliest admin
    });

    if (!admin) {
      throw new NotFoundException('No admin user found');
    }

    return admin;
  }

  async calculateUsersResponseTime() {
    const result = await this.userRepository.query(`
    WITH last60 AS (
      SELECT 
        m.id,
        m.sender_id,
        m.conversation_id,
        m.created_at,
        LAG(m.created_at) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at) AS prev_created,
        LAG(m.sender_id) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at) AS prev_sender
      FROM messages m
      WHERE m.created_at >= NOW() - INTERVAL '60 days'
    ),

    response_pairs AS (
      SELECT
        sender_id AS user_id,
        EXTRACT(EPOCH FROM (created_at - prev_created)) AS diff_seconds
      FROM last60
      WHERE prev_created IS NOT NULL
      AND sender_id != prev_sender  -- user responded to someone
    ),

    avg_times AS (
      SELECT
        user_id,
        AVG(diff_seconds) AS avg_seconds
      FROM response_pairs
      GROUP BY user_id
    )

    SELECT 
      u.id AS user_id,
      a.avg_seconds,
      FLOOR(a.avg_seconds / 86400) AS days,
      FLOOR(MOD(a.avg_seconds, 86400) / 3600) AS hours,
      FLOOR(MOD(a.avg_seconds, 3600) / 60) AS minutes
    FROM users u
    LEFT JOIN avg_times a ON a.user_id = u.id;
  `);

    return result;
  }



  async updateResponseTimes() {
    // 1) Get computed average response times from raw SQL
    const responseTimes = await this.calculateUsersResponseTime();

    if (!responseTimes || responseTimes.length === 0) {
      console.log('No response times found.');
      return;
    }

    // 2) Update each user in DB
    for (const rt of responseTimes) {
      await this.userRepository.update(
        { id: rt.user_id },
        {
          responseTime: rt.avg_seconds, // store seconds in DB
          responseTimeFormatted: `${rt?.days ?? 0}d ${rt?.hours ?? 0}h ${rt?.minutes ?? 0}m ${rt?.seconds ?? 0}s`
        }
      );
    }

    console.log(`Updated response time for ${responseTimes.length} users.`);
  }


  async createSellerSubAccount(activeAccountId, res: Response, req) {
    const existingSeller = await this.userAccountsRepo.findOne({
      where: { mainUserId: activeAccountId, role: 'seller' },
    });

    if (existingSeller) {
      throw new BadRequestException('You already have a seller account');
    }


    // 1. Load main user
    const mainUser = await this.userRepository.findOne({
      where: { id: activeAccountId },
    });


    if (!mainUser) {
      throw new UnauthorizedException("User not found");
    }

    if (mainUser.status === UserStatus.INACTIVE || mainUser.status === UserStatus.DELETED) {
      throw new UnauthorizedException('Your account is inactive. Please contact support.');
    }

    if (mainUser.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Your account has been suspended. Please contact support.');
    }

    if (mainUser.status === UserStatus.PENDING_VERIFICATION) {
      throw new UnauthorizedException('Please verify your email before logging in');
    }


    if (mainUser.role !== 'buyer') {
      throw new ForbiddenException('Only buyers can create seller sub accounts');
    }

    // 2. Create new user (COPY DATA)
    const subUser = this.userRepository.create({
      username: `${mainUser.username}_seller_${Date.now() % 100000}`,
      email: null,
      password: mainUser.password,
      role: 'seller',
      type: mainUser.type,
      phone: mainUser.phone,
      countryCode: mainUser.countryCode,
      profileImage: mainUser.profileImage,
      countryId: mainUser.countryId,
      languages: mainUser.languages,
      preferences: mainUser.preferences,
    });

    await this.userRepository.save(subUser);

    // 3. Link main → sub
    await this.userAccountsRepo.save({
      mainUserId: mainUser.id,
      subUserId: subUser.id,
      role: 'seller',
    });


    const emailPromises = [
      this.emailService.sendWelcomeEmail(subUser.email, subUser.username, subUser.role)
    ];



    if (subUser.role === 'seller') {
      emailPromises.push(
        this.emailService.sendSellerFeePolicyEmail(subUser.email, subUser.username)
      );
    }

    try {
      await Promise.all(emailPromises)

    } catch (err) {
      console.error('Failed to send onboarding emails:', err);
    }


    // 4. Login sub account (NO PASSWORD)
    return this.loginAsRelatedUser(mainUser.id, subUser.id, res, req);
  }

  async loginAsRelatedUser(currentUserId: string, targetUserId: string, res: Response, req) {

    // Verify relation exists
    // Check relation in BOTH directions
    const relation = await this.userAccountsRepo.findOne({
      where: [
        {
          mainUserId: currentUserId,
          subUserId: targetUserId,
        },
        {
          mainUserId: targetUserId,
          subUserId: currentUserId,
        },
      ],
    });

    if (!relation) {
      throw new ForbiddenException('Users not related');
    }

    const targetUser = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.permissions')
      .where('user.id = :id', { id: targetUserId })
      .getOne();

    if (!targetUser) {
      throw new UnauthorizedException("User not found")
    }


    targetUser.lastLogin = new Date();
    const deviceInfo = await this.sessionService.getDeviceInfoFromRequest(req);
    await this.sessionService.trackDevice(targetUser.id, deviceInfo);
    await this.userRepository.save(targetUser);

    // 1) create a new DB session
    const session = await this.createSession(targetUser, {
      deviceInfo: deviceInfo,
      ip: deviceInfo.ip_address,
      userAgent: req.headers['user-agent'] ?? null,
    });


    await this.sessionsRepo.save(session);

    // 2) issue tokens embedding sid
    const accessToken = this.jwtService.sign({ id: targetUser.id, sid: session.id, role: targetUser.role, permissions: targetUser.permissions }, { secret: process.env.JWT_SECRET, expiresIn: process.env.JWT_EXPIRE });
    const refreshToken = this.jwtService.sign({ id: targetUser.id, sid: session.id, role: targetUser.role, permissions: targetUser.permissions }, { secret: process.env.JWT_REFRESH, expiresIn: process.env.JWT_REFRESH_EXPIRE });

    // 3) store refresh token hash on the session (for rotation & revocation)
    await this.sessionsRepo.update(session.id, { refreshTokenHash: this.hash(refreshToken) });

    res.locals.accessToken = accessToken;
    res.locals.refreshToken = refreshToken;

    const relatedUsers = await this.getRelatedUsers(targetUser.id);

    // return serialized user + current session id (optional for UI)
    const serialized = this.serializeUser({ ...targetUser, accessToken, refreshToken, currentDeviceId: session.id, relatedUsers });
    return { accessToken, refreshToken, user: serialized };
  }


  async getRelatedUsers(userId: string) {
    const relations = await this.userAccountsRepo.find({
      where: [{ mainUserId: userId }, { subUserId: userId }],
      relations: ['mainUser', 'subUser'],
    });

    const relatedUsers = relations
      .map(rel => (rel.mainUserId === userId ? rel.subUser : rel.mainUser))
      .filter((user, index, self) =>
        index === self.findIndex(u => u.id === user.id) // keep only unique users by id
      );

    return relatedUsers;

  }

  static fromArray<T extends number>(permissions?: T[]): number {
    if (!permissions || permissions.length === 0) return 0;

    return permissions.reduce((mask, perm) => mask | perm, 0);
  }

  async updateUserPermissions(userId: string, dto: UpdateUserPermissionsDto) {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.permissions')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user) throw new NotFoundException('User not found');

    const updatedPermissions: Record<string, number> = {};

    for (const domain of Object.values(PermissionDomains)) {
      const value = dto[domain as keyof UpdateUserPermissionsDto];

      if (typeof value === 'number' && value > 0) {
        updatedPermissions[domain] = value;
      }
    }

    user.permissions =
      Object.keys(updatedPermissions).length > 0 ? updatedPermissions : null;


    const qb = this.sessionsRepo
      .createQueryBuilder()
      .update(UserSession)
      .set({ revokedAt: () => 'NOW()', refreshTokenHash: null })
      .where('"user_id" = :uid', { uid: userId });

    await qb.execute();

    return this.userRepository.save(user);
  }


  //for loged in users that want to send varification code to verify their phone 
  async sendPhoneVerificationOTP(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isPhoneVerified) {
      throw new BadRequestException('Your phone is already verified.');
    }

    if (!user.phone || !user.countryCode?.dial_code || !user.countryCode?.code) {
      throw new BadRequestException(
        'To verify your phone, please complete your phone information: phone number and country code are required.'
      );
    }

    if (user.countryCode.code !== 'SA' && user.countryCode.dial_code !== '+966') {
      throw new BadRequestException(
        'We currently only support phone numbers registered in Saudi Arabia (+966).'
      );
    }


    // ✅ Enforce resend cooldown
    const currentTimestamp = Date.now();
    if (user.otpLastSentAt) {
      const lastSentTime = user.otpLastSentAt.getTime();
      const timeElapsedSeconds = (currentTimestamp - lastSentTime) / 1000;

      if (timeElapsedSeconds < this.RESEND_COOLDOWN_SECONDS) {
        const remainingSeconds = Math.ceil(this.RESEND_COOLDOWN_SECONDS - timeElapsedSeconds);
        const remainingMinutes = Math.ceil(remainingSeconds / 60);
        throw new ForbiddenException(
          `Please wait ${remainingMinutes} minutes before requesting another OTP`
        );
      }
    }

    // ✅ Decide whether to reuse or generate OTP
    let otpCode: string;
    if (user.otpCode && user.otpExpiresAt && new Date() < user.otpExpiresAt) {
      otpCode = user.otpCode;
    } else {
      otpCode = this.generateOTP();
      user.otpCode = otpCode;
    }

    user.otpExpiresAt = new Date(currentTimestamp + this.CODE_EXPIRY_MINUTES * 60 * 1000);
    user.otpLastSentAt = new Date(currentTimestamp);
    await this.userRepository.save(user);

    // ✅ Send OTP via SMS provider
    await this.smsService.sendOTP(user.phone, user.countryCode.dial_code, user.otpCode, this.CODE_EXPIRY_MINUTES);
    return { message: 'OTP sent successfully to your phone number' };
  }

  //for loged in users that want to verify their phone
  async verifyPhoneOTP(
    userId,
    otpCode: string,
  ) {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isPhoneVerified) {
      throw new BadRequestException(
        'Your phone is already verified.'
      );
    }

    if (!user.phone || !user.countryCode?.dial_code || user.countryCode?.code) {
      throw new BadRequestException('To verify your phone, please complete your phone information: phone number and country code are required.');
    }

    if (!user.otpCode || user.otpCode !== otpCode) {
      throw new BadRequestException('Invalid OTP code');
    }
    if (!user.otpExpiresAt || new Date() > user.otpExpiresAt) {
      throw new BadRequestException('OTP has expired');
    }


    user.isPhoneVerified = true;


    user.otpCode = null;
    user.otpExpiresAt = null;
    user.otpLastSentAt = null;

    await this.userRepository.save(user);

    // 🔹 Return a simple success response (no login tokens)
    return { message: 'Phone number successfully verified' };
  }

  //for login or register with phone
  async phoneAuth(dto: PhoneRegisterDto) {
    const { phone, countryCode, role, type, ref } = dto;
    if (!phone || !countryCode?.code || !countryCode?.dial_code) {
      throw new UnauthorizedException('Phone or country code missing');
    }

    if (dto.countryCode.code !== 'SA' && dto.countryCode.dial_code !== '+966') {
      throw new BadRequestException(
        'We currently only support phone numbers registered in Saudi Arabia (+966).'
      );
    }

    // Check if user already exists
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.permissions')
      .where('user.phone = :phone', { phone })
      // Use ->> to extract the JSON value as text and '=' to compare
      .andWhere("user.countryCode ->> 'dial_code' = :dialCode", {
        dialCode: countryCode.dial_code
      })
      .getOne();

    const currentTimestamp = Date.now();
    if (user) {
      if ([UserStatus.INACTIVE, UserStatus.DELETED].includes(user.status)) {
        throw new UnauthorizedException('Your account is inactive. Please contact support.');
      }
      if (user.status === UserStatus.SUSPENDED) {
        throw new UnauthorizedException('Your account has been suspended. Please contact support.');
      }
      if (user.status === UserStatus.PENDING_VERIFICATION) {
        throw new UnauthorizedException('Please verify your email before logging in');
      }

      if (!user.isPhoneVerified) {
        throw new UnauthorizedException('Your phone number is not verified. Please verify with OTP before logging in.');
      }

      if (!user.phone || !user.countryCode?.dial_code || !user.countryCode?.code) {
        throw new BadRequestException(
          'To log in with your phone, please complete your phone information: a valid phone number and country code are required.'
        );
      }


      if (user.otpLastSentAt) {
        const lastSentTime = user.otpLastSentAt.getTime();
        const timeElapsedSeconds = (currentTimestamp - lastSentTime) / 1000;

        if (timeElapsedSeconds < this.RESEND_COOLDOWN_SECONDS) {
          const remainingSeconds = Math.ceil(this.RESEND_COOLDOWN_SECONDS - timeElapsedSeconds);
          const remainingMinutes = Math.ceil(remainingSeconds / 60);
          throw new ForbiddenException(
            `Please wait ${remainingMinutes} minutes before requesting another OTP`
          );
        }
      }
    }


    const otpExpiresAt = new Date(currentTimestamp + this.CODE_EXPIRY_MINUTES * 60 * 1000);
    const otpLastSentAt = new Date(currentTimestamp);

    let finalOTP;
    // 🔹 If user exists → update OTP fields on user
    if (user) {
      // ✅ Decide whether to reuse or generate OTP
      let otpCode: string;
      if (user.otpCode && user.otpExpiresAt && new Date() < user.otpExpiresAt) {
        otpCode = user.otpCode;
      } else {
        otpCode = this.generateOTP();
        user.otpCode = otpCode;
      }

      finalOTP = user.otpCode;
      user.otpCode = otpCode;
      user.otpExpiresAt = otpExpiresAt;
      user.otpLastSentAt = otpLastSentAt;
      await this.userRepository.save(user);
    } else {
      // 🔹 Otherwise → create or update pending phone registration
      let pendingPhone = await this.pendingPhoneRepository.findOne({
        where: { phone, countryCode },
      });

      if (pendingPhone && pendingPhone.otpLastSentAt) {
        const lastSentTime = pendingPhone.otpLastSentAt.getTime();
        const timeElapsedSeconds = (currentTimestamp - lastSentTime) / 1000;

        if (timeElapsedSeconds < this.RESEND_COOLDOWN_SECONDS) {
          const remainingSeconds = Math.ceil(this.RESEND_COOLDOWN_SECONDS - timeElapsedSeconds);
          const remainingMinutes = Math.ceil(remainingSeconds / 60);
          throw new ForbiddenException(
            `Please wait ${remainingMinutes} minutes before resending OTP`
          );
        }
      }

      if (role === UserRole.ADMIN) {
        throw new ForbiddenException('You cannot assign yourself as admin');
      }

      if (pendingPhone) {
        // ✅ Decide whether to reuse or generate OTP
        let otpCode: string;
        if (pendingPhone.otpCode && pendingPhone.otpExpiresAt && new Date() < pendingPhone.otpExpiresAt) {
          otpCode = pendingPhone.otpCode;
        } else {
          otpCode = this.generateOTP();
          pendingPhone.otpCode = otpCode;
        }
        finalOTP = otpCode;
        pendingPhone.otpCode = otpCode;
        pendingPhone.otpExpiresAt = otpExpiresAt;
        pendingPhone.otpLastSentAt = otpLastSentAt;
        await this.pendingPhoneRepository.save(pendingPhone);
      } else {
        finalOTP = this.generateOTP();
        const newPendingPhone = this.pendingPhoneRepository.create({
          phone,
          countryCode,
          otpCode: finalOTP,
          otpExpiresAt,
          otpLastSentAt,
          role: role || UserRole.BUYER, // default role
          type: type || 'Individual',     // default type
          referralCodeUsed: ref || null
        });
        await this.pendingPhoneRepository.save(newPendingPhone);
      }
    }

    // 🔹 Send OTP via SMS provider
    await this.smsService.sendOTP(phone, countryCode.dial_code, finalOTP, this.CODE_EXPIRY_MINUTES);
  }

  //for verify otp to login or register with phone
  async verifyOTP(
    otpCode: string,
    phone: string,
    countryCode: { code: string; dial_code: string },
    req: any,
    res: any
  ) {

    let user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.permissions')
      .leftJoinAndSelect('user.country', 'country')
      .where('user.phone = :phone', { phone })
      .andWhere('u."countryCode" @> :countryCode', {
        countryCode: JSON.stringify(countryCode),
      })

      .getOne();


    if (user) {
      if (user.isPhoneVerified) {
        throw new BadRequestException(
          'Your phone is already verified.'
        );
      }

      if (!user.phone || !user.countryCode?.dial_code || !user.countryCode?.code) {
        throw new BadRequestException('To log in with your phone, please complete your phone information: phone number and country code are required.');
      }

      // Validate OTP
      if (!user.otpCode || user.otpCode !== otpCode) {
        throw new BadRequestException('Invalid OTP code');
      }
      if (new Date() > user.otpExpiresAt) {
        throw new BadRequestException('OTP has expired');
      }

      // Clear OTP fields after successful verification
      user.otpCode = null;
      user.otpExpiresAt = null;
      user.otpLastSentAt = null;
      await this.userRepository.save(user);

      // 🔹 Issue tokens for login
      return await this.generateTokens(user, res, req);
    }

    // 🔹 Otherwise check pending phone registration
    const pendingPhone = await this.pendingPhoneRepository.findOne({
      where: { phone, countryCode },
    });

    if (!pendingPhone) {
      throw new NotFoundException('No active registration found for this phone number');
    }

    // Validate OTP
    if (pendingPhone.otpCode !== otpCode) {
      throw new BadRequestException('Invalid OTP code');
    }
    if (new Date() > pendingPhone.otpExpiresAt) {
      throw new BadRequestException('OTP has expired');
    }

    const { role, referralCodeUsed, type } = pendingPhone;
    const referralCode = crypto.randomBytes(8).toString('hex').toUpperCase();
    const finalRole = role === UserRole.ADMIN ? UserRole.BUYER : role;
    const baseName = phone; // use phone number as prefix 
    const uniqueSuffix = crypto.randomBytes(6).toString('hex'); // 12-char hex string
    // 🔹 Create new user record
    user = this.userRepository.create({
      username: `${baseName}_${uniqueSuffix}`,
      phone,
      countryCode,
      email: null,
      password: null,
      type,
      role: finalRole,
      referralCode: referralCode,
      isPhoneVerified: true,
    });

    await this.userRepository.save(user);

    // Process referral if used
    if (referralCodeUsed) {
      await this.processReferral(user, referralCodeUsed);
    }

    // Remove pending record
    await this.pendingPhoneRepository.delete(pendingPhone.id);

    // 🔹 Send onboarding messages
    // const onboardingPromises = [
    //   this.smsService.send(
    //     phone,
    //     `Welcome to Helhal, ${user.username}! Your account has been verified successfully.`
    //   ),
    // ];

    // if (user.role === 'seller') {
    //   onboardingPromises.push(
    //     this.smsService.send(
    //       phone,
    //       `Dear ${user.username}, please review our seller fee policy in your dashboard.`
    //     )
    //   );
    // }

    // try {
    //   await Promise.all(onboardingPromises);
    // } catch (err) {
    //   console.error('Failed to send onboarding messages:', err);
    // }

    // 🔹 Issue tokens for login immediately after registration
    return await this.generateTokens(user, res, req);
  }

  private generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

}
