import { Controller, Get, Post, Put, Body, Param, UseGuards, Req, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from 'decorators/roles.decorator';
import { UserRole } from 'entities/global.entity';
import { AbuseReportsService } from './abuse-reports.service';

@Controller('abuse-reports')
export class AbuseReportsController {
  constructor(private abuseReportsService: AbuseReportsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async createReport(@Req() req, @Body() createReportDto: any) {
    return this.abuseReportsService.createReport(req.user.id, createReportDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getReports(@Query('status') status?: string, @Query('page') page: number = 1) {
    return this.abuseReportsService.getReports(status, page);
  }

  @Get('my-reports')
  @UseGuards(JwtAuthGuard)
  async getMyReports(@Req() req, @Query('page') page: number = 1) {
    return this.abuseReportsService.getUserReports(req.user.id, page);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getReport(@Req() req, @Param('id') id: string) {
    return this.abuseReportsService.getReport(req.user.id, req.user.role, id);
  }

  @Put(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateReportStatus(@Param('id') id: string, @Body() body: { status: string, actionTaken?: string }) {
    return this.abuseReportsService.updateReportStatus(id, body.status, body.actionTaken);
  }

  @Get('stats/summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getReportStats() {
    return this.abuseReportsService.getReportStats();
  }
}