import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from 'src/auth/guard/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { Roles } from 'decorators/roles.decorator';
import { UserRole } from 'entities/global.entity';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class DashboardController {
    constructor(
        private readonly dashboardService: DashboardService,
    ) { }


    //for line charts
    @Get('overview')
    async getOverview(@Query('days') days = 30) {
        const sanitizedDays = Math.max(Number(days), 1);
        return this.dashboardService.getOverview({ days: sanitizedDays });
    }

    //for main cards
    @Get('counts-summary')
    async getCountsSummary(@Query('days') days = 30) {
        const sanitizedDays = Math.max(Number(days), 1); // prevent negative or 0
        return this.dashboardService.getCountsSummary(sanitizedDays);
    }

    //for status squares cards
    @Get('status-summary')
    async getCountsByStatus() {
        return this.dashboardService.getCountsByStatus();
    }

    @Get('recent')
    async getRecentData() {
        return this.dashboardService.getRecentData();
    }

}
