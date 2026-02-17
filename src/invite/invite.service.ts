import { Injectable, NotFoundException } from '@nestjs/common';
import { MailService } from 'common/nodemailer';
import { AuthService } from 'src/auth/auth.service';
import { SendInviteDto } from './dto/invite.dto';
import { ContactDto } from './dto/contact.dto';
import { SettingsService } from 'src/settings/settings.service';
import { Repository } from 'typeorm';
import { User } from 'entities/global.entity';
import { InjectRepository } from '@nestjs/typeorm';
@Injectable()
export class InviteService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly mailService: MailService,
        private readonly settingsService: SettingsService,
    ) { }

    async sendInvites(userId: string, dto: SendInviteDto) {
        const user = await this.userRepository.findOne({
            where: { id: userId },
            relations: ['person'],
            // 2. Select the specific columns from both tables
            select: {
                id: true,
                person: {
                    username: true,
                    email: true,
                    referralCode: true,
                }
            },
        });

        // if (!user) throw new NotFoundException('User not found');

        const frontend = process.env.FRONTEND_URL;

        // Build actual referral link
        const referralLink = `${frontend}/auth?tab=register${user ? `&ref=${user.referralCode}` : ""}`;

        // Replace placeholder
        const finalMessage = dto.message.replace('{link}', referralLink);

        // Send email to each email in list
        await Promise.all(
            dto.emails.map(email =>
                this.mailService.sendInviteEmail({
                    to: email,
                    subject: dto.subject,
                    senderName: dto.senderName,
                    message: finalMessage,
                })
            )
        );


        return {
            success: true,
            sent: dto.emails.length,
        };
    }

    async sendContact(userId: string | undefined, dto: ContactDto) {
        // Get platform settings to determine support email
        const settings = await this.settingsService.getSettings();
        const supportEmail = settings?.contactEmail || process.env.SUPPORT_EMAIL || 'support@example.com';

        // Compose message including sender contact info
        const fullMessageParts = [];
        fullMessageParts.push(dto.message || '');
        fullMessageParts.push('\n');
        fullMessageParts.push(`Sender Name: ${dto.senderName || 'N/A'}`);
        if (dto.email) fullMessageParts.push(`Sender Email: ${dto.email}`);
        if (userId) fullMessageParts.push(`User ID: ${userId}`);

        const finalMessage = fullMessageParts.join('\n');

        await this.mailService.sendInviteEmail({
            to: supportEmail,
            subject: dto.subject || `Contact request from ${dto.senderName || dto.email || 'user'}`,
            senderName: dto.senderName,
            message: finalMessage,
        });

        return { success: true };
    }
}
