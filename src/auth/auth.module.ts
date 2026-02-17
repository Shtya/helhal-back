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
  UserRelatedAccount,
  PendingPhoneRegistration,
  Person,
} from 'entities/global.entity';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { AccessGuard } from './guard/access.guard';
import { MailService } from 'common/nodemailer';
import { ReferralModule } from 'src/referral/referral.module';
import { SessionService } from './session.service';
import { SettingsService } from 'src/settings/settings.service';
import { SmsService } from 'common/sms-service';
import { NafathService } from 'common/nafath-service';
import { ConversationsModule } from 'src/conversations/conversations.module';
import { SharedModule } from 'common/shared.module';
@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forFeature([
      User,
      Person,
      UserRelatedAccount,
      PendingUserRegistration,
      PendingPhoneRegistration,
      AccountDeactivation,
      Order,
      ServiceReview,
      UserSession,
      Notification,
      Setting
    ]),
    forwardRef(() => SharedModule),
    forwardRef(() => ConversationsModule),
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
    AccessGuard,
    SettingsService,
    MailService,
    SmsService,
    NafathService
  ],
  controllers: [AuthController],
  exports: [AuthService, JwtAuthGuard, AccessGuard],
})
export class AuthModule { }
