import { Controller, Get, Post, Put, Body, Param, UseGuards, Req, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { AccessGuard } from '../auth/guard/access.guard';
import { RequireAccess } from 'decorators/access.decorator';
import { UserRole } from 'entities/global.entity';
import { DisputesService } from './disputes.service';
import { Permissions } from 'entities/permissions';

type ProposeResolutionBody = { resolution: string } | { sellerAmount: number; buyerRefund: number; note?: string };

@Controller('disputes')
export class DisputesController {
  constructor(private disputesService: DisputesService) { }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createDispute(@Req() req, @Body() dto: any) {
    return this.disputesService.createDispute(req.user.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN],
    permission: {
      domain: 'disputes',
      value: Permissions.Disputes.View
    }
  })
  async getDisputes(
    @Query('status') status?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
  ) {
    return this.disputesService.getDisputes({
      status,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search,
      sortBy,
      sortOrder,
    });
  }




  @Get('stats')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN],
    permission: {
      domain: 'disputes',
      value: Permissions.Disputes.View
    }
  })
  async stats() {
    return this.disputesService.getDisputeStats();
  }

  @Get('my-disputes')
  @UseGuards(JwtAuthGuard)
  async myDisputes(
    @Req() req,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10', // default as 10
    @Query('search') search: string = ''
  ) {
    const pageNumber = Number(page) || 1;
    const limitNumber = Number(limit) || 10;

    return this.disputesService.getUserDisputes(req.user.id, pageNumber, limitNumber, search);
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

  @Get(':id/messages')
  @UseGuards(JwtAuthGuard)
  async getMessages(
    @Req() req,
    @Param('id') id: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    const pageNumber = Number(page) || 1;
    const limitNumber = Number(limit) || 50;
    return this.disputesService.getDisputeMessages(req.user.id, req.user.role, id, pageNumber, limitNumber);
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
      status: 'open' | 'in_review' | 'resolved' | 'rejected' | 'closed_no_action';
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
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN],
    permission: {
      domain: 'disputes',
      value: Permissions.Disputes.Propose
    }
  })
  async proposeResolution(@Param('id') id: string, @Body() body: ProposeResolutionBody) {
    return this.disputesService.proposeResolution(id, body);
  }

  @Post(':id/resolve-payout')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN],
    permission: {
      domain: 'disputes',
      value: Permissions.Disputes.Propose
    }
  })
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
