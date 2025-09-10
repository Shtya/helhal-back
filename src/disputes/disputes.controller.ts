import { Controller, Get, Post, Put, Body, Param, UseGuards, Req, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from 'decorators/roles.decorator';
import { UserRole } from 'entities/global.entity';
import { DisputesService } from './disputes.service';

@Controller('disputes')
export class DisputesController {
  constructor(private disputesService: DisputesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async createDispute(@Req() req, @Body() createDisputeDto: any) {
    return this.disputesService.createDispute(req.user.id, createDisputeDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getDisputes(@Query('status') status?: string, @Query('page') page: number = 1) {
    return this.disputesService.getDisputes(status, page);
  }

  @Get('my-disputes')
  @UseGuards(JwtAuthGuard)
  async getMyDisputes(@Req() req, @Query('page') page: number = 1) {
    return this.disputesService.getUserDisputes(req.user.id, page);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getDispute(@Req() req, @Param('id') id: string) {
    return this.disputesService.getDispute(req.user.id, req.user.role, id);
  }

  @Put(':id/status')
  @UseGuards(JwtAuthGuard)
  async updateDisputeStatus(@Req() req, @Param('id') id: string, @Body() body: { status: string }) {
    return this.disputesService.updateDisputeStatus(req.user.id, req.user.role, id, body.status);
  }

  @Put(':id/resolution')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async proposeResolution(@Param('id') id: string, @Body() body: { resolution: string }) {
    return this.disputesService.proposeResolution(id, body.resolution);
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