import { Controller, Get, Post, Body, UseGuards, Req, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from 'decorators/roles.decorator';
import { UserRole } from 'entities/global.entity';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('sales')
  async getSalesReport(@Req() req, @Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return this.reportsService.getSalesReport(req.user.id, startDate, endDate);
  }

  @Get('earnings')
  async getEarningsReport(@Req() req, @Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return this.reportsService.getEarningsReport(req.user.id, startDate, endDate);
  }

  @Get('service-performance')
  async getServicePerformanceReport(@Req() req, @Query('serviceId') serviceId?: string, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.reportsService.getServicePerformanceReport(req.user.id, serviceId, startDate, endDate);
  }

  @Post('generate')
  async generateCustomReport(@Req() req, @Body() body: any) {
    return this.reportsService.generateCustomReport(req.user.id, body);
  }

  @Get('admin/summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getAdminSummaryReport(@Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return this.reportsService.getAdminSummaryReport(startDate, endDate);
  }

  @Get('admin/user-activity')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getUserActivityReport(@Query('userId') userId?: string, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.reportsService.getUserActivityReport(userId, startDate, endDate);
  }
}