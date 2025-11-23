import { Injectable, NotFoundException } from '@nestjs/common';
import { MailService } from 'common/nodemailer';
import { AuthService } from 'src/auth/auth.service';
import { SendInviteDto } from './dto/invite.dto';
import { Repository } from 'typeorm';
import { User } from 'entities/global.entity';
import { InjectRepository } from '@nestjs/typeorm';
@Injectable()
export class InviteService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly mailService: MailService
    ) { }

    async sendInvites(userId: string, dto: SendInviteDto) {
        const user = await this.userRepository.findOne({
            where: { id: userId },
            select: ['id', 'username', 'email', 'referralCode'],
        });

        if (!user) throw new NotFoundException('User not found');

        const frontend = process.env.FRONTEND_URL;

        // Build actual referral link
        const referralLink = `${frontend}/auth?tab=register&ref=${user.referralCode}`;

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
}
