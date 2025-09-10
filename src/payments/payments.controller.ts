import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post('create-payment-intent')
  async createPaymentIntent(@Req() req, @Body() body: { orderId: string, paymentMethod: string }) {
    return this.paymentsService.createPaymentIntent(req.user.id, body.orderId, body.paymentMethod);
  }

  @Post('confirm-payment')
  async confirmPayment(@Req() req, @Body() body: { paymentIntentId: string, orderId: string }) {
    return this.paymentsService.confirmPayment(req.user.id, body.paymentIntentId, body.orderId);
  }

  @Get('methods')
  async getPaymentMethods(@Req() req) {
    return this.paymentsService.getUserPaymentMethods(req.user.id);
  }

  @Post('methods')
  async addPaymentMethod(@Req() req, @Body() body: any) {
    return this.paymentsService.addPaymentMethod(req.user.id, body);
  }

  @Get('history')
  async getPaymentHistory(@Req() req, @Param('page') page: number = 1) {
    return this.paymentsService.getPaymentHistory(req.user.id, page);
  }
}