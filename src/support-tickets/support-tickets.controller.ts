import { Controller, Get, Post, Put, Body, Param, UseGuards, Req, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from 'decorators/roles.decorator';
import { UserRole } from 'entities/global.entity';
import { SupportTicketsService } from './support-tickets.service';

@Controller('support-tickets')
export class SupportTicketsController {
  constructor(private supportTicketsService: SupportTicketsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async createTicket(@Req() req, @Body() createTicketDto: any) {
    return this.supportTicketsService.createTicket(req.user.id, createTicketDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getTickets(@Query('status') status?: string, @Query('priority') priority?: string, @Query('page') page: number = 1) {
    return this.supportTicketsService.getTickets(status, priority, page);
  }

  @Get('my-tickets')
  @UseGuards(JwtAuthGuard)
  async getMyTickets(@Req() req, @Query('page') page: number = 1) {
    return this.supportTicketsService.getUserTickets(req.user.id, page);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getTicket(@Req() req, @Param('id') id: string) {
    return this.supportTicketsService.getTicket(req.user.id, req.user.role, id);
  }

  @Put(':id/status')
  @UseGuards(JwtAuthGuard)
  async updateTicketStatus(@Req() req, @Param('id') id: string, @Body() body: { status: string }) {
    return this.supportTicketsService.updateTicketStatus(req.user.id, req.user.role, id, body.status);
  }

  @Put(':id/priority')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateTicketPriority(@Param('id') id: string, @Body() body: { priority: string }) {
    return this.supportTicketsService.updateTicketPriority(id, body.priority);
  }

  @Post(':id/response')
  @UseGuards(JwtAuthGuard)
  async addResponse(@Req() req, @Param('id') id: string, @Body() body: { message: string, isInternal?: boolean }) {
    return this.supportTicketsService.addResponse(req.user.id, req.user.role, id, body.message, body.isInternal);
  }

  @Get('stats/summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getTicketStats() {
    return this.supportTicketsService.getTicketStats();
  }
}