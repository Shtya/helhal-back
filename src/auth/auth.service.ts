import { Injectable, UnauthorizedException, ConflictException, NotFoundException, BadRequestException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, Not, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { User, PendingUserRegistration, UserRole, UserStatus, AccountDeactivation, ServiceReview, Order, UserSession, DeviceInfo, SellerLevel, Notification, Setting, UserRelatedAccount, PendingPhoneRegistration, Person, Language } from 'entities/global.entity';
import { RegisterDto, LoginDto, VerifyEmailDto, ForgotPasswordDto, ResetPasswordDto, UpdateUserPermissionsDto, PhoneRegisterDto, PhoneVerifyDto, NafazDto } from 'dto/user.dto';
import { ConfigService } from '@nestjs/config';
import { MailService } from 'common/nodemailer';
import { SessionService } from './session.service';
import { PermissionDomains } from 'entities/permissions';
import { SmsService } from 'common/sms-service';
import { instanceToPlain } from 'class-transformer';
import { NafathService } from 'common/nafath-service';
import { ChatGateway } from 'src/chat/chat.gateway';
import { TranslationService } from 'common/translation.service';
import { NotificationService } from 'src/notification/notification.service';


@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    public userRepository: Repository<User>,

    @InjectRepository(Person)
    public personRepository: Repository<Person>,

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
    private notificationService: NotificationService,
    @InjectRepository(Setting) private settingsRepo: Repository<Setting>,
    @Inject(forwardRef(() => ChatGateway))
    private chatGateway: ChatGateway,

    public jwtService: JwtService,
    public configService: ConfigService,
    public emailService: MailService,
    public smsService: SmsService,
    public nafathService: NafathService,
    public sessionService: SessionService,
    private readonly i18n: TranslationService,
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
      throw new NotFoundException(this.i18n.t('events.user_not_found'));
    }

    user.person.status = status;

    if (status === UserStatus.DELETED) {
      user.person.deactivatedAt = new Date();

      // Record deactivation reason
      const deactivation = this.accountDeactivationRepository.create({
        user,
        userId: user.id,
        reason: 'User deactivated account',
      });
      await this.accountDeactivationRepository.save(deactivation);
    } else if (status === UserStatus.ACTIVE) {
      user.person.deactivatedAt = null;
    }

    return this.userRepository.save(user);
  }

  async getAllUsers(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [users, total] = await this.userRepository.findAndCount({
      where: { person: { status: Not(UserStatus.DELETED) } },
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
      throw new NotFoundException(this.i18n.t('events.user_not_found'));
    }

    user.person.status = UserStatus.DELETED;
    user.person.deactivatedAt = new Date();

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

    const existingPerson = await this.personRepository.createQueryBuilder('person')
      .where('person.email = :email', { email })
      .orWhere('person.username = :username', { username })
      .getOne();

    if (existingPerson) {
      if (existingPerson.email === email) {
        throw new ConflictException(this.i18n.t('auth.errors.email_already_exists'));
      } else if (existingPerson.username === username) {
        throw new ConflictException(this.i18n.t('auth.errors.username_already_exists'));
      }
    }

    const pendingUser = await this.pendingUserRepository.findOne({ where: { email } });
    const currentTimestamp = Date.now();

    if (pendingUser && pendingUser?.lastSentAt) {
      const lastSentTime = pendingUser.lastSentAt.getTime();
      const timeElapsedSeconds = (currentTimestamp - lastSentTime) / 1000;

      if (timeElapsedSeconds < this.RESEND_COOLDOWN_SECONDS) {
        const remainingSeconds = Math.ceil(this.RESEND_COOLDOWN_SECONDS - timeElapsedSeconds);
        throw new ForbiddenException(
          this.i18n.t('auth.errors.resend_email_cooldown', {
            args: { seconds: remainingSeconds },
          }),
        );
      }
    }

    const verificationCode = this.generateOTP();
    const documentExpiresAt = new Date(currentTimestamp + this.DOCUMENT_EXPIRY_HOURS * 60 * 60 * 1000);
    const codeExpiresAt = new Date(currentTimestamp + this.CODE_EXPIRY_MINUTES * 60 * 1000);

    if (role === UserRole.ADMIN) {
      throw new ForbiddenException(this.i18n.t('auth.errors.cannot_assign_admin_self'));
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

    return { message: this.i18n.t('auth.messages.verification_code_sent'), email };
  }

  async verifyEmail(verifyEmailDto: VerifyEmailDto, res: Response) {
    const { email, code } = verifyEmailDto;

    const pendingUser = await this.pendingUserRepository.findOne({ where: { email } });
    if (!pendingUser) {
      throw new NotFoundException(this.i18n.t('auth.errors.no_active_registration_email'));
    }

    if (pendingUser.verificationCode !== code) {
      throw new BadRequestException(this.i18n.t('auth.errors.invalid_verification_code'));
    }

    if (new Date() > pendingUser.codeExpiresAt) {
      throw new BadRequestException(this.i18n.t('auth.errors.verification_code_expired'));
    }

    const { username, email: userEmail, passwordHash, referralCodeUsed, role } = pendingUser;

    const finalRole = role === UserRole.ADMIN ? UserRole.BUYER : role;

    // Generate referral code for new user
    const referralCode = crypto.randomBytes(8).toString('hex').toUpperCase();


    const person = this.personRepository.create({
      username,
      email: userEmail,
      password: passwordHash,
      type: pendingUser.type,
      referralCode,
      preferredLanguage: Language.AR
    });

    const savedPerson = await this.personRepository.save(person);

    const user = this.userRepository.create({
      role: finalRole,
      person: savedPerson
    });

    await this.userRepository.save(user);

    if (referralCodeUsed) {
      await this.processReferral(user, referralCodeUsed);
    }

    await this.pendingUserRepository.delete(pendingUser.id);

    user.person.permissions = null;
    const serializedUser = await this.authenticateUser(user, res);


    const emailPromises = [
      this.emailService.sendWelcomeEmail(user.email, user.username, user.role, user.preferredLanguage)
    ];


    if (user.role === 'seller') {
      emailPromises.push(
        this.emailService.sendSellerFeePolicyEmail(user.email, user.username, user.preferredLanguage)
      );
    }

    try {
      await Promise.all(emailPromises)

    } catch (err) {
      console.error('Failed to send onboarding emails:', err);
    }

    return {
      message: this.i18n.t('auth.messages.email_verified_complete'),
      user: serializedUser,
    };
  }

  async processReferral(newUser: User, referralCodeUsed: string): Promise<void> {
    if (!referralCodeUsed) return;

    const referrerUser = await this.userRepository.findOne({ where: { person: { referralCode: referralCodeUsed } } });
    if (!referrerUser) return;

    newUser.person.referredBy = referrerUser;
    newUser.person.referredById = referrerUser.id;
    referrerUser.person.referralCount = (referrerUser.referralCount || 0) + 1;
    referrerUser.person.referralRewardsCount = (referrerUser.referralRewardsCount || 0) + 1;
    await this.userRepository.save([newUser, referrerUser]);

    // 🔔 Notify referral owner
    await this.notificationService.notifyWithLang({
      userIds: [referrerUser.id],
      type: 'referral_signup',
      title: {
        key: 'auth.messages.referral.signup_title'
      },
      message: {
        key: 'auth.messages.referral.signup_msg',
        args: { username: newUser.username }
      },
      relatedEntityId: newUser.id, // Pointing to the new user who joined
      relatedEntityType: 'user'
    });
  }

  async resendVerificationEmail(email: string) {
    const existingUser = await this.userRepository.findOne({ where: { person: { email } } });
    if (existingUser) {
      throw new ConflictException(this.i18n.t('auth.errors.email_already_registered'));
    }

    const pendingUser = await this.pendingUserRepository.findOne({ where: { email } });
    if (!pendingUser) {
      throw new NotFoundException(this.i18n.t('auth.errors.no_active_registration_email'));
    }

    const currentTimestamp = Date.now();

    if (pendingUser?.lastSentAt) {
      const lastSentTime = pendingUser.lastSentAt.getTime();
      const timeElapsedSeconds = (currentTimestamp - lastSentTime) / 1000;

      if (timeElapsedSeconds < this.RESEND_COOLDOWN_SECONDS) {
        const remainingSeconds = Math.ceil(this.RESEND_COOLDOWN_SECONDS - timeElapsedSeconds);
        throw new ForbiddenException(
          this.i18n.t('auth.errors.resend_email_cooldown', {
            args: { seconds: remainingSeconds },
          }),
        );
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

    return { message: this.i18n.t('auth.messages.new_verification_email_sent'), email };
  }

  async login(loginDto: LoginDto, res: Response, req) {

    const { email, password } = loginDto;

    const user = await this.userRepository.createQueryBuilder('user')
      .innerJoinAndSelect('user.person', 'person')
      .addSelect('person.password')
      .addSelect('person.permissions')
      .addSelect('person.nationalId')
      .leftJoinAndSelect('person.country', 'country')
      .where('person.email = :email', { email })
      .orderBy('user.role', 'ASC')
      .getOne();

    if (!user || !(await user.comparePassword(password))) {
      throw new UnauthorizedException(this.i18n.t('events.invalid_email_or_password'));
    }


    if (user.status === UserStatus.INACTIVE || user.status === UserStatus.DELETED) {
      throw new UnauthorizedException(this.i18n.t('auth.errors.account_inactive'));
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException(this.i18n.t('auth.errors.account_suspended'));
    }

    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new UnauthorizedException(this.i18n.t('auth.errors.email_not_verified'));
    }
    const result = await this.generateTokens(user, res, req);

    return result;
  }

  private async generateTokens(user: User, res: Response, req) {

    user.person.lastLogin = new Date();
    const deviceInfo = await this.sessionService.getDeviceInfoFromRequest(req);
    await this.sessionService.trackDevice(user.id, deviceInfo);
    await this.userRepository.manager.getRepository('Person').update(user.personId, {
      lastLogin: new Date()
    });

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

    const plainUser = instanceToPlain(user, {
      enableCircularCheck: true,
    }
    )
    const serialized = this.serializeUser({ ...plainUser, relatedUsers, currentDeviceId: session.id });
    return { accessToken, refreshToken, user: serialized };
  }


  async getCurrentUser(userId: string) {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.person', 'person')
      .leftJoinAndSelect('person.referredBy', 'referredBy')
      .leftJoinAndSelect('person.country', 'country')
      .addSelect('person.permissions')
      .addSelect('person.nationalId')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user) {
      throw new UnauthorizedException(this.i18n.t('events.user_not_found'));
    }

    const relatedUsers = await this.getRelatedUsers(user.id);
    (user as any).relatedUsers = relatedUsers;

    return this.serializeUser(user);
  }

  canViewUserProfile(meRole: string, targetRole: string) {
    if (meRole === UserRole.ADMIN) return true;

    if (meRole === UserRole.BUYER || meRole === UserRole.SELLER || !meRole) {
      return targetRole === UserRole.SELLER || targetRole === UserRole.ADMIN;
    }

    return false;
  }

  async getUserInfo(userId: string, me: any) {

    const qb = this.userRepository.createQueryBuilder('user')
      .innerJoinAndSelect('user.person', 'person')
      .leftJoinAndSelect('person.country', 'country')
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
    let meRole: string | undefined;

    if (!user) {
      throw new UnauthorizedException(this.i18n.t('events.user_not_found'));
    }
    if (me?.id) {
      const meUser = await this.userRepository.findOne({
        where: { id: me.id },
        select: ['id', 'role'], // only what we need
      });

      meRole = meUser?.role;
    }
    const isSelf = me?.id === user.id;
    if (!isSelf && !this.canViewUserProfile(meRole, user.role)) {
      throw new ForbiddenException(this.i18n.t('auth.errors.not_allowed_to_view_profile'));
    }

    const plainUser = instanceToPlain(user, {
      enableCircularCheck: true,
    })
    const relatedUsers = await this.getRelatedUsers(user.id);

    return this.serializeUser({ ...plainUser, relatedUsers });

  }

  async refreshTokens(refreshToken: string) {
    let decoded: { id: string; sid: string };
    try {
      decoded = this.jwtService.verify(refreshToken, { secret: this.configService.get('JWT_REFRESH') }) as any;
    } catch {
      throw new UnauthorizedException(this.i18n.t('auth.errors.invalid_or_expired_refresh_token'));
    }

    const user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.person', 'person')
      .addSelect('person.permissions')
      .where('user.id = :id', { id: decoded.id })
      .getOne();


    if (!user) {
      throw new UnauthorizedException(this.i18n.t('events.user_not_found'));
    }
    const session = await this.sessionsRepo.findOne({ where: { id: decoded.sid, userId: decoded.id } });
    if (!session || session.revokedAt) {
      throw new UnauthorizedException(this.i18n.t('auth.errors.session_revoked'));
    }
    // check token matches hash
    const incomingHash = this.hash(refreshToken);
    if (!session.refreshTokenHash || session.refreshTokenHash !== incomingHash) {
      throw new UnauthorizedException(this.i18n.t('auth.errors.refresh_token_mismatch'));
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

    return {
      message: this.i18n.t('auth.messages.tokens_refreshed'),
      accessToken: newAccess,
      refreshToken: newRefresh,
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    const user = await this.userRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.person', 'person')
      .where('person.email = :email', { email })
      // جلب الحقول المخفية صراحة
      .addSelect(['person.resetPasswordToken', 'person.resetPasswordExpires', 'person.lastResetPasswordSentAt', "person.preferredLanguage"])
      .getOne();

    if (!user) {
      return { message: this.i18n.t('auth.messages.otp_sent_if_account_exists') };
    }

    if (user.resetPasswordExpires && user?.lastResetPasswordSentAt) {
      const currentTimestamp = Date.now();
      const lastSentTime = user.lastResetPasswordSentAt.getTime();
      const timeElapsedSeconds = (currentTimestamp - lastSentTime) / 1000;

      if (timeElapsedSeconds < this.RESEND_COOLDOWN_SECONDS) {
        const remainingSeconds = Math.ceil(this.RESEND_COOLDOWN_SECONDS - timeElapsedSeconds);
        throw new ForbiddenException(
          this.i18n.t('auth.errors.resend_email_cooldown', { args: { seconds: remainingSeconds } }),
        );
      }

    }

    const otp = this.generateOTP();

    user.person.lastResetPasswordSentAt = new Date();
    user.person.resetPasswordToken = otp;
    user.person.resetPasswordExpires = new Date(Date.now() + this.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);

    await this.userRepository.save(user);

    await this.emailService.sendPasswordResetOtp(user.email, user.username, otp, user.preferredLanguage);

    return { message: this.i18n.t('auth.messages.password_reset_otp_sent') };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { email, otp, newPassword } = resetPasswordDto;

    const user = await this.userRepository.createQueryBuilder('user')
      // 1. Join the person table where security data now lives
      .innerJoinAndSelect('user.person', 'person')

      // 2. Query fields via the 'person' alias
      .where('person.email = :email', { email: email })
      .andWhere('person.resetPasswordToken = :token', { token: otp })
      .andWhere('person.resetPasswordExpires > :now', { now: new Date() })
      .getOne();

    if (!user) {
      throw new BadRequestException(this.i18n.t('auth.errors.invalid_email_or_otp'));
    }


    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await this.personRepository.update(user.personId, {
      password: hashedPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    });



    // Get admin/contact email from settings
    const settings = await this.settingsRepo.findOne({ where: {} });
    const adminEmail = settings?.contactEmail || process.env.ADMIN_EMAIL;

    // Send password change notification to the user
    await this.emailService.sendPasswordChangeNotification(user.email, user.username, adminEmail, user.preferredLanguage);

    return { message: this.i18n.t('auth.messages.password_reset_success') };
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


    (user as any).accessToken = accessToken;
    (user as any).refreshToken = refreshToken;
    (user as any).currentDeviceId = session.id;

    return this.serializeUser(user);
  }

  serializeUser(user: any) {
    const plainUser = instanceToPlain(user, {
      enableCircularCheck: true,
    }
    )
    return {
      ...plainUser,
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
      // 1. Join both the Person (Identity) and Country relations
      relations: ['person', 'person.country'],

      // 2. Map fields to their respective physical tables
      select: {
        id: true,
        profileImage: true,
        role: true,
        description: true,
        skills: true,
        education: true,
        certifications: true,
        introVideoUrl: true,
        portfolioItems: true,
        memberSince: true,
        portfolioFile: true,
        responseTime: true,
        deliveryTime: true,
        revisions: true,
        sellerLevel: true,
        lastActivity: true,
        preferences: true,
        balance: true,
        totalSpent: true,
        totalEarned: true,
        reputationPoints: true,
        ageGroup: true,


        person: {
          id: true,
          username: true,
          email: true,
          phone: true,
          countryCode: true,
          status: true,
          languages: true,
          lastLogin: true,
          country: true
        }
      }
    });

    if (!user) throw new NotFoundException(this.i18n.t('events.user_not_found'));
    return user;
  }

  async updateProfile(userId: string, updateData: Partial<User>, adminId?: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(this.i18n.t('events.user_not_found'));

    const isAdmin = !!adminId;
    if (isAdmin && user.role === UserRole.ADMIN && user.id != adminId) {
      throw new ForbiddenException(this.i18n.t('auth.errors.cannot_update_other_admin'));
    }

    const allowedFieldsUser: (keyof User)[] = ['profileImage', 'description', 'skills', 'education', 'certifications', 'deliveryTime', 'ageGroup', 'revisions', 'preferences'];
    const allowedFieldsPerson: (keyof Person)[] = ['countryCode', 'username', 'phone', 'languages', 'type', 'countryId', 'nationalId'];

    if (typeof updateData.email !== 'undefined' && updateData.email !== user.email) {
      const exists = await this.userRepository.findOne({ where: { person: { email: updateData.email } } });
      if (exists) throw new ConflictException(
        this.i18n.t('auth.errors.email_in_use')
      );
      user.person.email = updateData.email!;
    }

    // ✅ Username update check
    if (
      updateData.username && typeof updateData.username !== 'undefined' &&
      updateData.username !== user.username
    ) {
      const usernameExists = await this.userRepository.findOne({
        where: { person: { username: updateData.username } },
      });

      if (usernameExists) {
        throw new ConflictException(
          this.i18n.t('auth.errors.username_taken')
        );
      }

      user.person.username = updateData.username;
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
        .innerJoin('u.person', 'p')
        .where('p.phone = :phone', { phone: updateData.phone })
        .andWhere(`p.countryCode @> :countryCode`,
          { countryCode: JSON.stringify(updateData.countryCode), }
        )
        .andWhere('u.id != :id', { id: user.id })
        .getOne();

      if (exists) {
        throw new ConflictException(
          this.i18n.t('auth.errors.phone_in_use')
        );
      }

      user.person.phone = updateData.phone;
      user.person.countryCode = updateData.countryCode;
      user.person.isPhoneVerified = false;
      user.person.otpCode = null;
      user.person.otpLastSentAt = null;
      user.person.otpExpiresAt = null;
    }
    if (!updateData.phone || !updateData.countryCode) {

      user.person.otpCode = null;
      user.person.otpLastSentAt = null;
      user.person.otpExpiresAt = null;
    }

    if (updateData.nationalId && updateData.nationalId !== user.person.nationalId) {
      // Trim the ID per your preference
      const cleanNationalId = updateData.nationalId.trim();

      // Check if another user already has this National ID
      const idExists = await this.userRepository
        .createQueryBuilder('u')
        .innerJoin('u.person', 'p')
        .where('p.nationalId = :nationalId', { nationalId: cleanNationalId })
        .andWhere('u.id != :id', { id: user.id })
        .getOne();

      if (idExists) {
        throw new ConflictException(this.i18n.t('auth.errors.national_id_in_use'));
      }
      // Update the record and RESET verification status
      user.person.nationalId = cleanNationalId;
      user.person.isIdentityVerified = false; // Must re-verify with Nafath
      user.person.nafathTransId = null;       // Clear old transaction data
      user.person.nafathRequestId = null;
      user.person.nafathRandom = null;
    }


    for (const f of allowedFieldsUser) {
      if (typeof (updateData as any)[f] !== 'undefined') {
        (user as any)[f] = (updateData as any)[f];
      }
    }
    for (const f of allowedFieldsPerson) {
      if (f !== 'email' && typeof (updateData as any)[f] !== 'undefined') {
        (user.person as any)[f] = (updateData as any)[f];
      }
    }
    return this.userRepository.save(user);
  }

  async updateSkills(userId: string, skills: string[]) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(this.i18n.t('events.user_not_found'));
    user.skills = skills || [];
    return this.userRepository.save(user);
  }

  async getProfileStats(userId: any) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(this.i18n.t('events.user_not_found'));

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
    const plainProfile = instanceToPlain(profile, {
      enableCircularCheck: true
    })
    return { ...plainProfile, ordersCompleted, repeatBuyers, averageRating, topRated } as any;
  }

  async updateSellerLevelAutomatically(userId: string) {
    const stats = await this.getProfileStats(userId);
    let sellerLevel = SellerLevel.LVL1;
    if (stats.ordersCompleted >= 50 && stats.averageRating >= 4.8)
      sellerLevel = SellerLevel.TOP; // Top
    else if (stats.ordersCompleted >= 20 && stats.averageRating >= 4.5) SellerLevel.LVL2;

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(this.i18n.t('events.user_not_found'));
    user.sellerLevel = sellerLevel;
    user.topRated = sellerLevel === SellerLevel.TOP;
    return this.userRepository.save(user);
  }

  async updateSellerLevel(userId: string, level: SellerLevel, adminId) {
    // Validate the level
    if (!Object.values(SellerLevel).includes(level)) {
      throw new BadRequestException(
        this.i18n.t('auth.errors.invalid_seller_level', { args: { level } })
      );
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) this.i18n.t('auth.errors.user_not_found', { args: { id: userId } })


    // Optional: prevent changing other admins
    if (user.role === UserRole.ADMIN && user.id !== adminId) {
      throw new ForbiddenException(
        this.i18n.t('auth.errors.cannot_update_other_admin')
      );
    }

    user.sellerLevel = level;
    return this.userRepository.save(user);
  }

  async deactivateAccount(userId: string, reason: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(this.i18n.t('events.user_not_found'));
    }

    if (user.status === UserStatus.INACTIVE) {
      throw new ConflictException(this.i18n.t('auth.errors.account_already_deactivated'));
    }

    // Create deactivation record
    const deactivation = this.accountDeactivationRepository.create({
      userId,
      reason,
      user,
    });

    // Update user status
    user.person.status = UserStatus.INACTIVE;
    user.person.deactivatedAt = new Date();

    await this.userRepository.save(user);
    await this.accountDeactivationRepository.save(deactivation);

    return { message: this.i18n.t('auth.messages.account_deactivated_success') };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userRepository.createQueryBuilder('user')
      .innerJoinAndSelect('user.person', 'person')
      .addSelect('person.password').where('user.id = :id', { id: userId }).getOne();

    if (!user) throw new NotFoundException(this.i18n.t('events.user_not_found'));

    const ok = await user.comparePassword(currentPassword);
    if (!ok) throw new UnauthorizedException(this.i18n.t('auth.errors.current_password_incorrect'));
    user.person.password = newPassword; // your entity hook hashes on save (existing logic)
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);


    await this.personRepository.update(user.personId, {
      password: hashedPassword
    });

    // Get admin/contact email from settings
    const settings = await this.settingsRepo.findOne({ where: {} });
    const adminEmail = settings?.contactEmail || process.env.ADMIN_EMAIL;

    // Send password change notification to the user
    await this.emailService.sendPasswordChangeNotification(user.email, user.username, adminEmail, user.preferredLanguage);

    return { message: this.i18n.t('auth.messages.password_changed_success') };
  }

  // auth.service.ts
  async logoutSession(userId: string, sessionId: string) {
    const session = await this.sessionsRepo.findOne({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException(this.i18n.t('auth.errors.session_not_found'));

    if (!session.revokedAt) {
      session.revokedAt = new Date();
      session.refreshTokenHash = null;
      await this.sessionsRepo.save(session);
    }


    return { message: this.i18n.t('auth.messages.session_revoked'), id: sessionId };
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
    return {
      message: keepSessionId
        ? this.i18n.t('auth.messages.session_revoked')
        : this.i18n.t('auth.messages.session_revoked'),
    };
  }


  async requestEmailChange(userId: string, newEmail: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(this.i18n.t('events.user_not_found'));

    // Check if new email is already used
    const cleanEmail = newEmail.trim().toLowerCase();

    const emailExists = await this.userRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.person', 'person')
      .where('person.email = :email', { email: cleanEmail })
      .select([
        'user.id',
        'person.username',
        'person.email',
        'person.pendingEmail',
        'person.pendingEmailCode',
        'person.lastEmailChangeSentAt',
        'person.preferredLanguage'
      ])
      .getOne();
    if (emailExists) throw new BadRequestException(this.i18n.t('auth.errors.email_in_use'));

    // Cooldown check
    if (user.lastEmailChangeSentAt) {
      const currentTimestamp = Date.now();
      const lastSentTime = user.lastEmailChangeSentAt.getTime();
      const timeElapsedSeconds = (currentTimestamp - lastSentTime) / 1000;

      if (timeElapsedSeconds < this.RESEND_COOLDOWN_SECONDS) {
        const remainingSeconds = Math.ceil(this.RESEND_COOLDOWN_SECONDS - timeElapsedSeconds);
        throw new ForbiddenException(
          this.i18n.t('auth.errors.resend_email_cooldown', {
            args: { seconds: remainingSeconds },
          }),
        );
      }
    }

    // Update last sent timestamp
    const code = this.generateOTP();

    user.person.lastEmailChangeSentAt = new Date();
    user.person.pendingEmail = newEmail;
    user.person.pendingEmailCode = code;

    await this.userRepository.save(user);

    // Send confirmation email
    await this.emailService.sendEmailChangeConfirmation(newEmail, user.username, user.id, code, user.preferredLanguage);

    return { message: this.i18n.t('auth.messages.confirmation_email_sent_new_email') };
  }

  async resendEmailConfirmation(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: {
        id: true,
        person: {
          username: true,
          email: true,
          pendingEmail: true,
          pendingEmailCode: true,
          lastEmailChangeSentAt: true,
        }
      },
    });
    if (!user || !user.pendingEmail || !user.pendingEmailCode) {
      throw new BadRequestException(this.i18n.t('auth.errors.no_pending_email_change'));
    }

    // Cooldown check
    if (user.lastEmailChangeSentAt) {
      const currentTimestamp = Date.now();
      const lastSentTime = user.lastEmailChangeSentAt.getTime();
      const timeElapsedSeconds = (currentTimestamp - lastSentTime) / 1000;

      if (timeElapsedSeconds < this.RESEND_COOLDOWN_SECONDS) {
        const remainingSeconds = Math.ceil(this.RESEND_COOLDOWN_SECONDS - timeElapsedSeconds);
        throw new ForbiddenException(
          this.i18n.t('auth.errors.resend_email_cooldown', {
            args: { seconds: remainingSeconds },
          }),
        );
      }
    }

    user.person.lastEmailChangeSentAt = new Date()

    await this.userRepository.save(user);

    await this.emailService.sendEmailChangeConfirmation(
      user.pendingEmail,
      user.username,
      user.id,
      user.pendingEmailCode
      , user.preferredLanguage
    );

    return { message: this.i18n.t('auth.messages.confirmation_email_resent') };
  }

  async cancelEmailChange(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: {
        id: true,
        person: {
          username: true,
          email: true,
          pendingEmail: true,
          pendingEmailCode: true,
          lastEmailChangeSentAt: true,
        }
      },

    });
    if (!user) throw new NotFoundException(this.i18n.t('events.user_not_found'));

    user.person.pendingEmail = null;
    user.person.pendingEmailCode = null;
    user.person.lastEmailChangeSentAt = null;

    await this.userRepository.save(user);
    return { message: this.i18n.t('auth.messages.pending_email_change_canceled') };
  }

  async confirmEmailChange(userId: string, pendingEmail: string, code: string) {
    const cleanUserId = userId.trim();

    const user = await this.userRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.person', 'person') // Joining the person relation
      .where('user.id = :id', { id: cleanUserId })
      .select([
        'user.id',
        'person.username',
        'person.email',
        'person.pendingEmail',
        'person.pendingEmailCode',
        'person.lastEmailChangeSentAt',
        'person.preferredLanguage'
      ])
      .getOne();

    if (!user) throw new NotFoundException(this.i18n.t('events.user_not_found'));

    if (user.pendingEmail !== pendingEmail || user.pendingEmailCode !== code) {
      throw new BadRequestException(this.i18n.t('auth.errors.invalid_code_or_pending_email'));
    }

    // Check if email is now used
    const emailExists = await this.userRepository.findOne({ where: { person: { email: pendingEmail } } });
    if (emailExists) throw new BadRequestException(this.i18n.t('auth.errors.email_in_use'));

    const oldEmail = user.email;
    user.person.email = pendingEmail;
    user.person.pendingEmail = null;
    user.person.pendingEmailCode = null;
    user.person.lastEmailChangeSentAt = null;

    await this.userRepository.save(user);
    // Get admin/contact email from settings
    const settings = await this.settingsRepo.findOne({ where: {} });
    const adminEmail = settings?.contactEmail || process.env.ADMIN_EMAIL;

    // Send password change notification to the user
    await this.emailService.sendEmailChangeNotification(oldEmail, user.username, adminEmail, user.preferredLanguage);
    return { message: this.i18n.t('auth.messages.email_updated_success') };
  }

  async getFirstAdmin() {
    const admin = await this.userRepository.findOne({
      where: { role: 'admin' },
      order: { created_at: 'ASC' }, // get the earliest admin
    });

    if (!admin) {
      throw new NotFoundException(this.i18n.t('auth.errors.no_admin_found'));
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
      throw new BadRequestException(this.i18n.t('auth.errors.seller_account_exists'));
    }


    // 1. Load main user
    const mainUser = await this.userRepository.findOne({
      where: { id: activeAccountId }, relations: {
        person: true
      },
    });


    if (!mainUser) {
      throw new UnauthorizedException(this.i18n.t('events.user_not_found'));
    }

    if (mainUser.status === UserStatus.INACTIVE || mainUser.status === UserStatus.DELETED) {
      throw new UnauthorizedException(this.i18n.t('auth.errors.account_inactive'));
    }

    if (mainUser.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException(this.i18n.t('auth.errors.account_suspended'));
    }

    if (mainUser.status === UserStatus.PENDING_VERIFICATION) {
      throw new UnauthorizedException(this.i18n.t('auth.errors.email_not_verified'));
    }


    if (mainUser.role !== 'buyer') {
      throw new ForbiddenException(this.i18n.t('auth.errors.only_buyers_can_create_seller'));
    }

    // 2. Create new user (COPY DATA)
    const subUser = this.userRepository.create({
      personId: mainUser.personId,
      role: 'seller',
      profileImage: mainUser.profileImage,
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
      this.emailService.sendWelcomeEmail(subUser.email, subUser.username, subUser.role, mainUser.preferredLanguage)
    ];


    if (subUser.role === 'seller') {
      emailPromises.push(
        this.emailService.sendSellerFeePolicyEmail(subUser.email, subUser.username, mainUser.preferredLanguage)
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
      throw new ForbiddenException(this.i18n.t('auth.errors.users_not_related'));
    }

    const targetUser = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.person', 'person')
      .addSelect('person.permissions')
      .addSelect('person.nationalId')
      .where('user.id = :id', { id: targetUserId })
      .getOne();

    if (!targetUser) {
      throw new UnauthorizedException(this.i18n.t('events.user_not_found'))
    }


    const deviceInfo = await this.sessionService.getDeviceInfoFromRequest(req);
    await this.sessionService.trackDevice(targetUser.id, deviceInfo);
    await this.personRepository.update(targetUser.personId, {
      lastLogin: new Date()
    });

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
    const plainTargetUser = instanceToPlain(targetUser, {
      enableCircularCheck: true
    })
    // return serialized user + current session id (optional for UI)
    const serialized = this.serializeUser({ ...plainTargetUser, accessToken, refreshToken, currentDeviceId: session.id, relatedUsers });
    return { accessToken, refreshToken, user: serialized };
  }


  async getRelatedUsers(userId: string) {
    const relations = await this.userAccountsRepo.find({
      where: [{ mainUserId: userId }, { subUserId: userId }],
      relations: {
        mainUser: {
          person: true // Profile for the primary account
        },
        subUser: {
          person: true // Profile for the linked/sub account
        }
      },
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
      .leftJoinAndSelect('user.person', 'person')
      .addSelect('person.permissions')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user) throw new NotFoundException(this.i18n.t('events.user_not_found'));

    const updatedPermissions: Record<string, number> = {};

    for (const domain of Object.values(PermissionDomains)) {
      const value = dto[domain as keyof UpdateUserPermissionsDto];

      if (typeof value === 'number' && value > 0) {
        updatedPermissions[domain] = value;
      }
    }


    const qb = this.sessionsRepo
      .createQueryBuilder()
      .update(UserSession)
      .set({ revokedAt: () => 'NOW()', refreshTokenHash: null })
      .where('"user_id" = :uid', { uid: userId });

    await qb.execute();

    await this.personRepository.update(user.personId, {
      permissions: Object.keys(updatedPermissions).length > 0 ? updatedPermissions : null
    });

  }


  //for loged in users that want to send varification code to verify their phone 
  async sendPhoneVerificationOTP(userId: string) {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.person', 'person')
      .addSelect(['person.otpCode', 'person.otpExpiresAt'])
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user) {
      throw new NotFoundException(this.i18n.t('events.user_not_found'));
    }

    if (user.isPhoneVerified) {
      throw new BadRequestException(this.i18n.t('auth.errors.phone_already_verified'));
    }

    if (!user.phone || !user.countryCode?.dial_code || !user.countryCode?.code) {
      throw new BadRequestException(this.i18n.t('auth.errors.phone_info_required'));
    }

    if (user.countryCode.code !== 'SA' && user.countryCode.dial_code !== '+966') {
      throw new BadRequestException(
        this.i18n.t('auth.errors.only_saudi_phone_support')
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
          this.i18n.t('auth.errors.otp_wait_seconds', { args: { seconds: remainingSeconds } })
        );
      }
    }

    // ✅ Decide whether to reuse or generate OTP
    let otpCode: string;
    if (user.otpCode && user.otpExpiresAt && new Date() < user.otpExpiresAt) {
      otpCode = user.otpCode;
    } else {
      otpCode = this.generateOTP();
    }

    const { success, details } = await this.smsService.sendOTP(
      user.phone,
      user.countryCode.dial_code,
      otpCode,
      this.CODE_EXPIRY_MINUTES,
    );
    if (!success) {
      throw new BadRequestException(details || this.i18n.t('auth.errors.failed_to_send_otp'));
    }

    await this.personRepository.update(user.personId, {
      otpCode: otpCode,
      otpExpiresAt: new Date(currentTimestamp + this.CODE_EXPIRY_MINUTES * 60 * 1000),
      otpLastSentAt: new Date(currentTimestamp)
    });

    // await this.userRepository.save(user);

    // ✅ Send OTP via SMS provider

    return { message: this.i18n.t('auth.messages.otp_sent_phone') };
  }

  //for loged in users that want to verify their phone
  async verifyPhoneOTP(
    userId,
    otpCode: string,
  ) {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.person', 'person')
      .addSelect(['person.otpCode', 'person.otpExpiresAt'])
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user) {
      throw new NotFoundException(this.i18n.t('events.user_not_found'));
    }

    if (user.isPhoneVerified) {
      throw new BadRequestException(this.i18n.t('auth.errors.phone_already_verified'));
    }

    if (!user.phone || !user.countryCode?.dial_code || !user.countryCode?.code) {
      throw new BadRequestException(this.i18n.t('auth.errors.phone_info_required'));
    }

    if (!user.otpCode || user.otpCode !== otpCode) {
      throw new BadRequestException(this.i18n.t('auth.errors.invalid_otp'));
    }
    if (!user.otpExpiresAt || new Date() > user.otpExpiresAt) {
      throw new BadRequestException(this.i18n.t('auth.errors.otp_expired'));
    }


    await this.personRepository.update(user.personId, {
      isPhoneVerified: true,
      otpCode: null,
      otpExpiresAt: null,
      otpLastSentAt: null,
    });

    // 🔹 Return a simple success response (no login tokens)
    return { message: this.i18n.t('auth.messages.phone_verified_success') };
  }

  //for login or register with phone
  async phoneAuth(dto: PhoneRegisterDto) {
    const { phone, countryCode, role, type, ref } = dto;
    if (!phone || !countryCode?.code || !countryCode?.dial_code) {
      throw new UnauthorizedException(this.i18n.t('auth.errors.phone_or_country_missing'));
    }

    if (dto.countryCode.code !== 'SA' && dto.countryCode.dial_code !== '+966') {
      throw new BadRequestException(
        this.i18n.t('auth.errors.only_saudi_phone_support')
      );
    }

    // Check if user already exists
    const user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.person', 'person')
      .addSelect(['person.permissions', 'person.otpCode', 'person.otpExpiresAt'])
      .where('person.phone = :phone', { phone })
      // Use ->> to extract the JSON value as text and '=' to compare
      .andWhere("person.countryCode ->> 'dial_code' = :dialCode", {
        dialCode: countryCode.dial_code
      })
      .getOne();

    const currentTimestamp = Date.now();
    if (user) {
      if ([UserStatus.INACTIVE, UserStatus.DELETED].includes(user.status)) {
        throw new UnauthorizedException(this.i18n.t('auth.errors.account_inactive'));
      }
      if (user.status === UserStatus.SUSPENDED) {
        throw new UnauthorizedException(this.i18n.t('auth.errors.account_suspended'));
      }
      if (user.status === UserStatus.PENDING_VERIFICATION) {
        throw new UnauthorizedException(this.i18n.t('auth.errors.email_not_verified'));
      }

      if (!user.isPhoneVerified) {
        throw new UnauthorizedException(this.i18n.t('auth.errors.phone_not_verified'));
      }

      if (!user.phone || !user.countryCode?.dial_code || !user.countryCode?.code) {
        throw new BadRequestException(this.i18n.t('auth.errors.phone_info_required'));
      }


      if (user.otpLastSentAt) {
        const lastSentTime = user.otpLastSentAt.getTime();
        const timeElapsedSeconds = (currentTimestamp - lastSentTime) / 1000;

        if (timeElapsedSeconds < this.RESEND_COOLDOWN_SECONDS) {
          const remainingSeconds = Math.ceil(this.RESEND_COOLDOWN_SECONDS - timeElapsedSeconds);
          throw new ForbiddenException(
            this.i18n.t('auth.errors.resend_email_cooldown', { args: { seconds: remainingSeconds } }),
          );
        }
      }
    }
    else {
      throw new NotFoundException(this.i18n.t('events.user_not_found'));
    }


    const otpExpiresAt = new Date(currentTimestamp + this.CODE_EXPIRY_MINUTES * 60 * 1000);
    const otpLastSentAt = new Date(currentTimestamp);

    let finalOTP;
    // 🔹 If user exists → update OTP fields on user
    if (user) {
      // ✅ Decide whether to reuse or generate OTP
      if (user.otpCode && user.otpExpiresAt && new Date() < user.otpExpiresAt) {
        finalOTP = user.otpCode;
      } else {
        finalOTP = this.generateOTP();
      }

      const { success, details } = await this.smsService.sendOTP(
        phone,
        countryCode.dial_code,
        finalOTP,
        this.CODE_EXPIRY_MINUTES,
      );
      if (!success) {
        throw new BadRequestException(details || this.i18n.t('auth.errors.failed_to_send_otp'));
      }

      await this.personRepository.update(user.personId, {
        otpCode: finalOTP,
        otpExpiresAt: otpExpiresAt,
        otpLastSentAt: otpLastSentAt,
      });

    }
    // else {
    //   // 🔹 Otherwise → create or update pending phone registration
    //   let pendingPhone = await this.pendingPhoneRepository.findOne({
    //     where: { phone, countryCode },
    //   });

    //   if (pendingPhone && pendingPhone.otpLastSentAt) {
    //     const lastSentTime = pendingPhone.otpLastSentAt.getTime();
    //     const timeElapsedSeconds = (currentTimestamp - lastSentTime) / 1000;

    //     if (timeElapsedSeconds < this.RESEND_COOLDOWN_SECONDS) {
    //       const remainingSeconds = Math.ceil(this.RESEND_COOLDOWN_SECONDS - timeElapsedSeconds);
    //       const remainingMinutes = Math.ceil(remainingSeconds / 60);
    //       throw new ForbiddenException(
    //         `Please wait ${remainingSeconds} seconds before resending OTP`
    //       );
    //     }
    //   }

    //   if (role === UserRole.ADMIN) {
    //     throw new ForbiddenException('You cannot assign yourself as admin');
    //   }

    //   if (pendingPhone) {
    //     // ✅ Decide whether to reuse or generate OTP
    //     if (pendingPhone.otpCode && pendingPhone.otpExpiresAt && new Date() < pendingPhone.otpExpiresAt) {
    //       finalOTP = pendingPhone.otpCode;
    //     } else {
    //       finalOTP = this.generateOTP();
    //       pendingPhone.otpCode = finalOTP;
    //     }
    //   } else {
    //     finalOTP = this.generateOTP();
    //   }

    //   const { success, details } = await this.smsService.sendOTP(phone, countryCode.dial_code, finalOTP, this.CODE_EXPIRY_MINUTES);
    //   if (!success) {
    //     throw new BadRequestException('Failed to send OTP')
    //   }


    //   if (pendingPhone) {
    //     pendingPhone.otpCode = finalOTP;
    //     pendingPhone.otpExpiresAt = otpExpiresAt;
    //     pendingPhone.otpLastSentAt = otpLastSentAt;
    //     await this.pendingPhoneRepository.save(pendingPhone);
    //   } else {
    //     const newPendingPhone = this.pendingPhoneRepository.create({
    //       phone,
    //       countryCode,
    //       otpCode: finalOTP,
    //       otpExpiresAt,
    //       otpLastSentAt,
    //       role: role || UserRole.BUYER, // default role
    //       type: type || 'Individual',     // default type
    //       referralCodeUsed: ref || null
    //     });
    //     await this.pendingPhoneRepository.save(newPendingPhone);
    //   }
    // }

    // 🔹 Send OTP via SMS provider

    return { message: this.i18n.t('auth.messages.otp_sent_phone') };
  }

  //for verify otp to login or register with phone
  async verifyOTP(
    dto: PhoneVerifyDto,
    req: any,
    res: any
  ) {

    const { code: otpCode, countryCode, phone } = dto;
    let user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.person', 'person')
      .addSelect(['person.permissions', 'person.otpCode', 'person.otpExpiresAt', 'person.nationalId'])
      .leftJoinAndSelect('person.country', 'country')
      .where('person.phone = :phone', { phone })
      .andWhere(`person.countryCode @> :countryCode`,
        { countryCode: JSON.stringify(countryCode), }
      )
      .orderBy('user.role', 'ASC')
      .getOne();


    if (user) {
      if (!user.isPhoneVerified) {
        throw new UnauthorizedException(this.i18n.t('auth.errors.phone_not_verified'));
      }

      if (!user.phone || !user.countryCode?.dial_code || !user.countryCode?.code) {
        throw new BadRequestException(this.i18n.t('auth.errors.phone_info_required'));
      }

      // Validate OTP
      if (!user.otpCode || user.otpCode !== otpCode) {
        throw new BadRequestException(this.i18n.t('auth.errors.invalid_otp'));
      }
      if (new Date() > user.otpExpiresAt) {
        throw new BadRequestException(this.i18n.t('auth.errors.otp_expired'));
      }

      // Clear OTP fields after successful verification
      await this.personRepository.update(user.personId, {
        otpCode: null,
        otpExpiresAt: null,
        otpLastSentAt: null,
      });


      // 🔹 Issue tokens for login
      const result = await this.generateTokens(user, res, req);
      return result;
    }
    else {
      throw new NotFoundException(this.i18n.t('events.user_not_found'));
    }

    // // 🔹 Otherwise check pending phone registration
    // const pendingPhone = await this.pendingPhoneRepository.findOne({
    //   where: { phone, countryCode },
    // });

    // if (!pendingPhone) {
    //   throw new NotFoundException('No active registration found for this phone number');
    // }

    // // Validate OTP
    // if (pendingPhone.otpCode !== otpCode) {
    //   throw new BadRequestException('Invalid OTP code');
    // }
    // if (new Date() > pendingPhone.otpExpiresAt) {
    //   throw new BadRequestException('OTP has expired');
    // }

    // const { role, referralCodeUsed, type } = pendingPhone;
    // const referralCode = crypto.randomBytes(8).toString('hex').toUpperCase();
    // const finalRole = role === UserRole.ADMIN ? UserRole.BUYER : role;
    // const baseName = phone; // use phone number as prefix 
    // const uniqueSuffix = crypto.randomBytes(6).toString('hex'); // 12-char hex string
    // // 🔹 Create new user record
    // user = this.userRepository.create({
    //   username: `${baseName}_${uniqueSuffix}`,
    //   phone,
    //   countryCode,
    //   email: null,
    //   password: null,
    //   type,
    //   role: finalRole,
    //   referralCode: referralCode,
    //   isPhoneVerified: true,
    // });

    // await this.userRepository.save(user);

    // // Process referral if used
    // if (referralCodeUsed) {
    //   await this.processReferral(user, referralCodeUsed);
    // }

    // // Remove pending record
    // await this.pendingPhoneRepository.delete(pendingPhone.id);

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
    // return await this.generateTokens(user, res, req);
  }

  async initiateNafathFlow(userId: string, dto: NafazDto) {

    const user = await this.userRepository.findOne({ where: { id: userId }, relations: ['person'] });
    if (!user || !user.person) {
      throw new NotFoundException(this.i18n.t('events.user_not_found'));
    }

    if (!dto.nationalId) {
      throw new UnauthorizedException(this.i18n.t('auth.errors.national_id_required'));
    }

    if (dto.nationalId == user.nationalId && user.isIdentityVerified) {
      throw new BadRequestException(this.i18n.t('auth.errors.identity_already_verified'));
    }

    const requestId = uuidv4();
    const nafathResponse = await this.nafathService.createMfaRequest(dto.nationalId, "HelhalVerify", requestId);

    await this.personRepository.update(user.personId, {
      nationalId: dto.nationalId,
      nafathTransId: nafathResponse.transId, // From MfaRequestResponseDto
      nafathRandom: nafathResponse.random,   // The 2-digit number (e.g., "15")
      nafathRequestId: requestId,            // Your internal GUID
      isIdentityVerified: false,
    });

    // 2. Start polling in the background
    this.pollNafathStatus(requestId, user, dto.nationalId, nafathResponse.transId, nafathResponse.random);

    return {
      message: this.i18n.t('auth.messages.mfa_initiated'),
      requestId,
      random: nafathResponse.random,
    };
  }
  // At the top of your AuthService
  private activePolls = new Map<string, NodeJS.Timeout>();

  private async pollNafathStatus(requestId: string, user: User, nationalId: string, transId: string, random: string) {
    const startTime = Date.now();
    const timeout = 120000; // 2 minutes
    const interval = 2000;  // 2 seconds

    const check = setInterval(async () => {

      try {
        const elapsed = Date.now() - startTime;
        const response = await this.nafathService.getMfaStatus(nationalId, transId, random);
        const status = response.status; // EXPIRED, REJECTED, COMPLETED, WAITING

        if (status === 'COMPLETED') {
          this.stopPoll(user.id, check);
          // Verify token before finalizing
          const decoded = await this.nafathService.verifyNafathToken(response.token);
          await this.personRepository.update(user.personId, {
            isIdentityVerified: true,
            nationalId: nationalId,
            nafathTransId: transId,
            nafathRequestId: requestId,
            nafathRandom: null,
          });
          this.chatGateway.emitNafathStatus(user.id, { status: 'COMPLETED', requestId, random });
        }
        else if (status === 'REJECTED' || status === 'EXPIRED') {
          this.stopPoll(user.id, check);
          this.chatGateway.emitNafathStatus(user.id, { status, requestId, random });
        }
        else if (status === 'WAITING') {
          this.chatGateway.emitNafathStatus(user.id, { status, requestId, random });
        }
        else if (elapsed >= timeout) {
          this.stopPoll(user.id, check);
          this.chatGateway.emitNafathStatus(user.id, { status: 'TIMEOUT', requestId, random });
        }
        // If status is WAITING, the interval continues...

      } catch (error) {
        this.stopPoll(user.id, check);
        this.chatGateway.emitNafathStatus(user.id, { status: 'ERROR', requestId, random, message: error.message });
      }
    }, interval);

    this.activePolls.set(user.id, check);
  }

  private stopPoll(userId: string, interval: NodeJS.Timeout) {
    clearInterval(interval);
    this.activePolls.delete(userId);
  }

  async cancelNafathFlow(userId: string) {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.person', 'person')
      .addSelect('person.nationalId')
      .addSelect('person.nafathTransId')
      .where('user.id = :id', { id: userId })
      .getOne();


    if (!user || !user.person) throw new NotFoundException(this.i18n.t('events.user_not_found'));

    // BLOCK: If already verified, do not allow cancellation/reset of data
    if (user.person.isIdentityVerified) {
      throw new ForbiddenException(this.i18n.t('auth.errors.cannot_cancel_verified_identity'));
    }

    if (!user.person.nafathTransId) {
      throw new NotFoundException(this.i18n.t('auth.errors.no_active_nafath_request'));
    }

    // Otherwise, proceed with normal cancellation
    const interval = this.activePolls.get(userId);
    if (interval) {
      clearInterval(interval);
      this.activePolls.delete(userId);
    }

    await this.personRepository.update(user.personId, {
      nafathTransId: null,
      nafathRandom: null,
      nafathRequestId: null,
    });

    return { message: this.i18n.t('auth.messages.mfa_cancelled') };
  }
  private generateOTP() {

    return Math.floor(1000 + Math.random() * 9000).toString()
  }

}