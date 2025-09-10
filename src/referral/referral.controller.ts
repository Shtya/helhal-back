import { Controller, Get, Post, UseGuards, Req, Query, Body } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { ReferralService } from './referral.service';

@Controller('referral')
@UseGuards(JwtAuthGuard)
export class ReferralController {
  constructor(private referralService: ReferralService) {}

  @Get('info')
  async getReferralInfo(@Req() req) {
    return this.referralService.getUserReferralInfo(req.user.id);
  }

  @Get('stats')
  async getReferralStats(@Req() req) {
    return this.referralService.getUserReferralStats(req.user.id);
  }

  @Get('referrals')
  async getReferrals(@Req() req, @Query('page') page: number = 1) {
    return this.referralService.getUserReferrals(req.user.id, page);
  }

  @Get('affiliate')
  async getAffiliateInfo(@Req() req) {
    return this.referralService.getUserAffiliateInfo(req.user.id);
  }

  @Post('generate-code')
  async generateAffiliateCode(@Req() req) {
    return this.referralService.generateAffiliateCode(req.user.id);
  }

  @Get('commissions')
  async getCommissions(@Req() req, @Query('page') page: number = 1) {
    return this.referralService.getUserCommissions(req.user.id, page);
  }

  @Post('withdraw-commission')
  async withdrawCommission(@Req() req, @Body() body: { amount: number }) {
    return this.referralService.withdrawCommission(req.user.id, body.amount);
  }
}