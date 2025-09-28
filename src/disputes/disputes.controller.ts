import { Controller, Get, Post, Put, Body, Param, UseGuards, Req, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from 'decorators/roles.decorator';
import { UserRole } from 'entities/global.entity';
import { DisputesService } from './disputes.service';

type ProposeResolutionBody = { resolution: string } | { sellerAmount: number; buyerRefund: number; note?: string };

@Controller('disputes')
export class DisputesController {
  constructor(private disputesService: DisputesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async createDispute(@Req() req, @Body() dto: any) {
    return this.disputesService.createDispute(req.user.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getDisputes(@Query('status') status?: string, @Query('page') page: string = '1') {
    return this.disputesService.getDisputes(status, Number(page) || 1);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async stats() {
    return this.disputesService.getDisputeStats();
  }

  @Get('my-disputes')
  @UseGuards(JwtAuthGuard)
  async myDisputes(@Req() req, @Query('page') page: string = '1') {
    return this.disputesService.getUserDisputes(req.user.id, Number(page) || 1);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getDispute(@Req() req, @Param('id') id: string) {
    return this.disputesService.getDispute(req.user.id, req.user.role, id);
  }

  @Get(':id/activity')
  @UseGuards(JwtAuthGuard)
  async activity(@Req() req, @Param('id') id: string) {
    return this.disputesService.getActivity(req.user.id, req.user.role, id);
  }

  @Post(':id/messages')
  @UseGuards(JwtAuthGuard)
  async postMessage(@Req() req, @Param('id') id: string, @Body() body: { message: string; parentId?: string }) {
    return this.disputesService.postMessage(req.user.id, req.user.role, id, body.message, body.parentId);
  }

  // disputes.controller.ts
  @Put(':id/status')
  @UseGuards(JwtAuthGuard)
  async updateStatus(
    @Req() req,
    @Param('id') id: string,
    @Body()
    body: {
      status: 'open' | 'in_review' | 'resolved' | 'rejected';
      sellerAmount?: number;
      buyerRefund?: number;
      note?: string;
      closeAs?: 'completed' | 'cancelled';
      setResolutionOnly?: boolean;
    },
  ) {
    return this.disputesService.updateDisputeStatusSmart(req.user.id, req.user.role, id, body);
  }

  @Put(':id/resolution')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async proposeResolution(@Param('id') id: string, @Body() body: ProposeResolutionBody) {
    return this.disputesService.proposeResolution(id, body);
  }

  @Post(':id/resolve-payout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async resolveAndPayout(@Req() req, @Param('id') id: string, @Body() body: { sellerAmount: number; buyerRefund: number; note?: string; closeAs: 'completed' | 'cancelled' }) {
    return this.disputesService.resolveAndPayout(req.user.id, req.user.role, id, body);
  }

  @Post(':id/accept-resolution')
  @UseGuards(JwtAuthGuard)
  async acceptResolution(@Req() req, @Param('id') id: string) {
    return this.disputesService.acceptResolution(req.user.id, id);
  }

  @Post(':id/reject-resolution')
  @UseGuards(JwtAuthGuard)
  async rejectResolution(@Req() req, @Param('id') id: string) {
    return this.disputesService.rejectResolution(req.user.id, id);
  }
}
