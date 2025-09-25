import { Controller, Get, Post, Body, UseGuards, Req, Query, Param, Delete, Put } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { AccountingService } from './accounting.service';

@Controller('accounting')
@UseGuards(JwtAuthGuard)
export class AccountingController {
  constructor(private accountingService: AccountingService) {}

  @Get('balance')
  async getBalance(@Req() req) {
    return this.accountingService.getUserBalance(req.user.id);
  }

  @Get('transactions')
  async getTransactions(@Req() req, @Query('page') page: number = 1, @Query('type') type?: string) {
    return this.accountingService.getUserTransactions(req.user.id, page, type);
  }

  @Post('withdraw')
  async withdrawFunds(@Req() req, @Body() body: { amount: number; paymentMethodId: string }) {
    return this.accountingService.withdrawFunds(req.user.id, body.amount, body.paymentMethodId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('withdrawals')
  async listWithdrawalsAdmin(@Query('page') page = 1, @Query('status') status?: string) {
    return this.accountingService.listWithdrawalsAdmin(Number(page), status);
  }

  @Put('withdrawals/:id')
  async processWithdrawalAdmin(@Param('id') id: string, @Body() body: { action: 'approve' | 'reject' }) {
    return this.accountingService.processWithdrawalAdmin(id, body.action);
  }

  @Get('payment-methods')
  async getPaymentMethods(@Req() req) {
    return this.accountingService.getUserPaymentMethods(req.user.id);
  }

  @Post('payment-methods')
  async addPaymentMethod(@Req() req, @Body() body: any) {
    return this.accountingService.addPaymentMethod(req.user.id, body);
  }

  @Delete('payment-methods/:id')
  async removePaymentMethod(@Req() req, @Param('id') id: string) {
    return this.accountingService.removePaymentMethod(req.user.id, id);
  }

  @Get('earnings')
  async getEarningsReport(@Req() req, @Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return this.accountingService.getEarningsReport(req.user.id, startDate, endDate);
  }
}
