import { Module } from '@nestjs/common';
import { InviteController } from './invite.controller';
import { InviteService } from './invite.service';
import { AuthModule } from 'src/auth/auth.module';
import { MailService } from 'common/nodemailer';
import { AuthService } from 'src/auth/auth.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'entities/global.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([User])
    ],
    controllers: [InviteController],
    providers: [InviteService, MailService],
})
export class InviteModule { }
