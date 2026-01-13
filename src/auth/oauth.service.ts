import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { User, UserRole, UserStatus } from 'entities/global.entity';
import { AuthService } from './auth.service';
import { randomBytes } from 'crypto';
import { MailService } from 'common/nodemailer';

@Injectable()
export class OAuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private authService: AuthService,
    private jwtService: JwtService,
    private configService: ConfigService,
    public emailService: MailService,
  ) { }

  async processReferral(newUser: User, referralCodeUsed?: string): Promise<void> {
    if (!referralCodeUsed) return;

    const referrerUser = await this.userRepository.findOne({ where: { referralCode: referralCodeUsed } });
    if (referrerUser) {
      newUser.referredBy = referrerUser;
      newUser.referredById = referrerUser.id;
      referrerUser.referralCount = (referrerUser.referralCount || 0) + 1;
      referrerUser.referralRewardsCount = (referrerUser.referralRewardsCount || 0) + 1;
      await this.userRepository.save([newUser, referrerUser]);
    }
  }

  createOAuthState(redirectPath: string, referralCode?: string, type?: string): string {
    return JSON.stringify({ redirectPath, referralCode, type });
  }

  parseOAuthState(state: string): { redirectPath: string; referralCode?: string, type?: string } {
    try {
      return JSON.parse(state);
    } catch (error) {
      return { redirectPath: '/' };
    }
  }

  async handleGoogleCallback(profile: any, state?: string, res?: Response) {
    const email = profile.email;
    if (!email) throw new UnauthorizedException('No email found in Google profile');

    let user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.permissions')
      .where('user.email = :email', { email: email })
      .getOne();

    let newUserCreated = false;
    if (!user) {
      const baseName = profile.name || email.split('@')[0];
      const uniqueSuffix = randomBytes(6).toString('hex'); // 12-char hex string

      user = this.userRepository.create({
        username: `${baseName}_${uniqueSuffix}`,
        email,
        googleId: profile.id,
        role: 'buyer',
        type: 'Individual'
      });
      await this.userRepository.save(user);
      newUserCreated = true;
    }
    else if (!user.googleId) {
      user.googleId = profile.id;
      await this.userRepository.update(user.id, {
        googleId: profile.id
      });
    }

    if (user.status === UserStatus.INACTIVE || user.status === UserStatus.DELETED) {
      throw new UnauthorizedException('Your account is inactive. Please contact support.');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Your account has been suspended. Please contact support.');
    }

    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new UnauthorizedException('Please verify your email before logging in');
    }

    return this.finalizeOAuthAuthentication(user, state, res, newUserCreated);
  }

  async handleAppleCallback(profile: any, state?: string, res?: Response) {
    const email = profile.email;
    if (!email) throw new UnauthorizedException('No email found in Apple profile');


    let user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.permissions')
      .where('user.email = :email', { email: email })
      .getOne();

    let newUserCreated = false;
    if (!user) {
      const baseName = profile.name || email.split('@')[0];
      const uniqueSuffix = randomBytes(6).toString('hex'); // 12-char hex string

      user = this.userRepository.create({
        username: `${baseName}_${uniqueSuffix}`,
        email,
        appleId: profile.id,
        role: 'buyer',
        type: 'Individual'
      });
      await this.userRepository.save(user);
      newUserCreated = true;
    } else if (!user.appleId) {
      user.appleId = profile.id;
      await this.userRepository.update(user.id, {
        appleId: profile.id
      })
    }

    if (user.status === UserStatus.INACTIVE || user.status === UserStatus.DELETED) {
      throw new UnauthorizedException('Your account is inactive. Please contact support.');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Your account has been suspended. Please contact support.');
    }

    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new UnauthorizedException('Please verify your email before logging in');
    }

    return this.finalizeOAuthAuthentication(user, state, res, newUserCreated);
  }

  async finalizeOAuthAuthentication(user: User, state?: string, res?: Response, newUserCreated?: boolean) {
    let redirectPath = '/';
    let referralCodeUsed: string | undefined;
    let userType;

    if (state) {
      try {
        const parsedState = this.parseOAuthState(state);
        redirectPath = parsedState.redirectPath;
        referralCodeUsed = parsedState.referralCode;
        userType = parsedState.type;
      } catch (error) {
        console.warn('Failed to parse OAuth state:', error);
      }
    }

    if (userType === UserRole.ADMIN) {
      throw new ForbiddenException('You cannot assign yourself as admin');
    }
    // ✔ Set role only if valid
    if (userType === UserRole.BUYER || userType === UserRole.SELLER) {
      user.role = userType;
      await this.userRepository.save(user);
    }

    if (referralCodeUsed && !user.referredBy) {
      await this.processReferral(user, referralCodeUsed);
    }

    const serializedUser = await this.authService.authenticateUser(user, res);

    if (newUserCreated) {

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
    }

    return { redirectPath, user: serializedUser };
  }

  generateOneTimeToken(userId: string, referralCodeUsed?: string): string {
    return this.jwtService.sign(
      { userId, referralCodeUsed },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: '30d',
      },
    );
  }

  verifyOneTimeToken(token: string): { userId: string; referralCodeUsed?: string } {
    try {
      return this.jwtService.verify(token, { secret: process.env.JWT_ACCESS_SECRET });
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired one-time token');
    }
  }
}