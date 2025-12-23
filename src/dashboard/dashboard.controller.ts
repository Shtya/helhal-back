import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from 'src/auth/guard/jwt-auth.guard';
import { AccessGuard } from 'src/auth/guard/access.guard';
import { RequireAccess } from 'decorators/access.decorator';
import { UserRole } from 'entities/global.entity';
import { Permissions } from 'entities/permissions';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, AccessGuard)
@RequireAccess({
    roles: [UserRole.ADMIN], permission: {
        domain: 'statistics',
        value: Permissions.Statistics.View
    }
})
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
