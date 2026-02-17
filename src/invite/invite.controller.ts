import { Controller, Post, UseGuards, Req, Body } from '@nestjs/common';
import { InviteService } from './invite.service';
import { JwtAuthGuard } from 'src/auth/guard/jwt-auth.guard';
import { SendInviteDto } from './dto/invite.dto';
import { ContactDto } from './dto/contact.dto';

@Controller('invite')
export class InviteController {
    constructor(private readonly inviteService: InviteService) { }

    // @UseGuards(JwtAuthGuard)
    @Post('send')
    async sendInvites(@Req() req: any, @Body() dto: SendInviteDto) {
        return this.inviteService.sendInvites(req?.user?.id, dto);
    }

    @Post('contact')
    async contactSupport(@Req() req: any, @Body() dto: ContactDto) {
        return this.inviteService.sendContact(req?.user?.id, dto);
    }
}
