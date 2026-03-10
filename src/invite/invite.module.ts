import { Module } from '@nestjs/common';
import { InviteController } from './invite.controller';
import { InviteService } from './invite.service';
import { AuthModule } from 'src/auth/auth.module';
import { MailService } from 'common/nodemailer';
import { AuthService } from 'src/auth/auth.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Setting, User } from 'entities/global.entity';
import { SettingsService } from 'src/settings/settings.service';
import { MailModule } from 'common/mailModule';

@Module({
    imports: [
        MailModule,
        TypeOrmModule.forFeature([User, Setting])
    ],
    controllers: [InviteController],
    providers: [InviteService, SettingsService],
})
export class InviteModule { }
