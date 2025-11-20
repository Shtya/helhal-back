// --- File: auth/auth.module.ts ---
import { forwardRef, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { AppleStrategy } from './strategies/apple.strategy';
import {
  User,
  PendingUserRegistration,
  AccountDeactivation,
  Order,
  ServiceReview,
  UserSession,
  Notification,
  Setting,
} from 'entities/global.entity';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { RolesGuard } from './guard/roles.guard';
import { MailService } from 'common/nodemailer';
import { ReferralModule } from 'src/referral/referral.module';
import { SessionService } from './session.service';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forFeature([
      User,
      PendingUserRegistration,
      AccountDeactivation,
      Order,
      ServiceReview,
      UserSession,
      Notification,
      Setting
    ]),
    forwardRef(() => ReferralModule),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async () => ({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: process.env.JWT_EXPIRE },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    SessionService,
    AuthService,
    OAuthService,
    JwtStrategy,
    GoogleStrategy,
    AppleStrategy,
    JwtAuthGuard,
    RolesGuard,
    MailService
  ],
  controllers: [AuthController],
  exports: [AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule { }
