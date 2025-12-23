import { Controller, Get, Post, Body, UseGuards, Req, Query, Param, Delete, Put } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { AccountingService } from './accounting.service';
import { RequireAccess } from 'decorators/access.decorator';
import { UserRole } from 'entities/global.entity';
import { AccessGuard } from 'src/auth/guard/access.guard';
import { Permissions } from 'entities/permissions';

@Controller('accounting')
@UseGuards(JwtAuthGuard)
export class AccountingController {
  constructor(private accountingService: AccountingService) { }

  @Get('billing-information')
  async getBillingInformation(@Req() req) {
    return this.accountingService.getBillingInformation(req.user.id);
  }

  @Put('billing-information')
  async updateBillingInformation(@Req() req, @Body() billingInfo: any) {
    return this.accountingService.updateBillingInformation(req.user.id, billingInfo);
  }

  // Bank Account Endpoints
  @Get('bank-accounts')
  async getBankAccounts(@Req() req) {
    return this.accountingService.getBankAccounts(req.user.id);
  }

  @Post('bank-accounts')
  async createBankAccount(@Req() req, @Body() bankAccountData: any) {
    return this.accountingService.createBankAccount(req.user.id, bankAccountData);
  }


  @Put('bank-accounts/:id')
  async updateBankAccount(@Req() req, @Param('id') id: string, @Body() bankAccountData: any) {
    return this.accountingService.updateBankAccount(req.user.id, id, bankAccountData);
  }

  @Delete('bank-accounts/:id')
  async deleteBankAccount(@Req() req, @Param('id') id: string) {
    return this.accountingService.deleteBankAccount(req.user.id, id);
  }

  @Put('bank-accounts/:id/set-default')
  async setDefaultBankAccount(@Req() req, @Param('id') id: string) {
    return this.accountingService.setDefaultBankAccount(req.user.id, id);
  }

  // Add these to your existing AccountingController

  @Get('billing-history')
  async getBillingHistory(@Req() req, @Query('page') page: number = 1, @Query('limit') limit: number = 1, @Query('search') search?: string, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.accountingService.getBillingHistory(req.user.id, page, limit, search, startDate, endDate);
  }

  @Get('available-balances')
  async getAvailableBalances(@Req() req) {
    return this.accountingService.getAvailableBalances(req.user.id);
  }

  @Get('balance')
  @RequireAccess({
    roles: [UserRole.ADMIN], permission: {
      domain: 'finance',
      value: Permissions.Finance.View
    }
  })
  async getBalance(@Req() req) {
    return this.accountingService.getUserBalance(req.user.id);
  }

  @Get('admin/transactions')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireAccess({
    roles: [UserRole.ADMIN], permission: {
      domain: 'finance',
      value: Permissions.Finance.View
    }
  })
  async getAllTransactions(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    return this.accountingService.getTransactions({ page, limit, type, search });
  }


  @Get('transactions')
  @UseGuards(JwtAuthGuard)
  async getTransactions(
    @Req() req,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    return this.accountingService.getTransactions({
      page,
      limit,
      type,
      search,
    }, req.user.id);
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
