import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { User } from 'entities/global.entity';
import { AuthService } from './auth.service';

@Injectable()
export class OAuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private authService: AuthService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

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

  createOAuthState(redirectPath: string, referralCode?: string): string {
    return JSON.stringify({ redirectPath, referralCode });
  }

  parseOAuthState(state: string): { redirectPath: string; referralCode?: string } {
    try {
      return JSON.parse(state);
    } catch (error) {
      return { redirectPath: '/' };
    }
  }

  async handleGoogleCallback(profile: any, state?: string, res?: Response) {
    const email = profile.email;

    let user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      user = this.userRepository.create({
        username: profile.name || email.split('@')[0],
        email,
        googleId: profile.id,
        role: 'buyer',
      });
      await this.userRepository.save(user);
    } 
    else if (!user.googleId) {
      user.googleId = profile.id;
      await this.userRepository.save(user);
    }

    return this.finalizeOAuthAuthentication(user, state, res);
  }

  async handleAppleCallback(profile: any, state?: string, res?: Response) {
    const email = profile.email;
    if (!email) throw new UnauthorizedException('No email found in Apple profile');

    let user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      user = this.userRepository.create({ 
        username: profile.name || email.split('@')[0], 
        email, 
        appleId: profile.id, 
        role: 'buyer' 
      });
      await this.userRepository.save(user);
    } else if (!user.appleId) {
      user.appleId = profile.id;
      await this.userRepository.save(user);
    }

    return this.finalizeOAuthAuthentication(user, state, res);
  }

  async finalizeOAuthAuthentication(user: User, state?: string, res?: Response) {
    let redirectPath = '/';
    let referralCodeUsed: string | undefined;

    if (state) {
      try {
        const parsedState = this.parseOAuthState(state);
        redirectPath = parsedState.redirectPath;
        referralCodeUsed = parsedState.referralCode;
      } catch (error) {
        console.warn('Failed to parse OAuth state:', error);
      }
    }

    if (referralCodeUsed && !user.referredBy) {
      await this.processReferral(user, referralCodeUsed);
    }

    const serializedUser = await this.authService.authenticateUser(user, res);
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