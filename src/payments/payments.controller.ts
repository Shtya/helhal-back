import { Controller, Get, Post, Body, Req, Logger, Query, Res } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymobPaymentService } from './base/paymob.payment.service';

@Controller('payments')

export class PaymentsController {
  private readonly logger = new Logger('Paymob');
  constructor(private paymentsService: PaymentsService,
    private readonly paymobService: PaymobPaymentService,
  ) { }

  @Post('webhooks/paymob')
  async handlePaymobWebhook(
    @Body() body: any,
    @Query('hmac') queryHmac: string,
    @Req() req: any
  ) {

    try {
      await this.paymobService.processWebhook(body, queryHmac);
      return { status: 'success' };
    } catch (error) {
      this.logger.error(`Webhook processing failed: ${error.message}`);
      throw error;
    }
  }

  @Get('paymob/callback')
  async handlePaymobCallback(@Query() query: any, @Res() res: any) {
    const redirectUrl = await this.paymobService.handleRedirection(query);

    // Perform the actual browser redirect to your frontend
    return res.redirect(redirectUrl);
  }

  // @UseGuards(JwtAuthGuard)
  // @Post('create-payment-intent')
  // async createPaymentIntent(@Req() req, @Body() body: { orderId: string; paymentMethod: string }) {
  //   return this.paymentsService.createPaymentIntent(req.user.id, body.orderId, body.paymentMethod);
  // }
  // @UseGuards(JwtAuthGuard)
  // @Post('confirm-payment')
  // async confirmPayment(@Req() req, @Body() body: { paymentIntentId: string; orderId: string }) {
  //   return this.paymentsService.confirmPayment(req.user.id, body.paymentIntentId, body.orderId);
  // }
  // @UseGuards(JwtAuthGuard)
  // @Get('methods')
  // async getPaymentMethods(@Req() req) {
  //   return this.paymentsService.getUserPaymentMethods(req.user.id);
  // }
  // @UseGuards(JwtAuthGuard)
  // @Post('methods')
  // async addPaymentMethod(@Req() req, @Body() body: any) {
  //   return this.paymentsService.addPaymentMethod(req.user.id, body);
  // }
  // @UseGuards(JwtAuthGuard)
  // @Get('history')
  // async getPaymentHistory(@Req() req, @Param('page') page: number = 1) {
  //   return this.paymentsService.getPaymentHistory(req.user.id, page);
  // }

  // payments/payments.controller.ts
  // @UseGuards(JwtAuthGuard)
  // @Post('checkout')
  // async createCheckout(@Req() req, @Body() body: { orderId: string; provider?: string; successUrl: string; cancelUrl: string }) {
  //   return this.paymentsService.createCheckout(req.user.id, body);
  // }
  // @UseGuards(JwtAuthGuard)
  // @Get('checkout/:orderId')
  // async getCheckout(@Param('orderId') orderId: string) {
  //   const order = await this.paymentsService.orderRepository.findOne({ where: { id: orderId } });
  //   if (!order) throw new NotFoundException('Order not found');

  //   return {
  //     orderId,
  //     redirectUrl: `/payment?orderId=${orderId}`,
  //   };
  // }
  // @UseGuards(JwtAuthGuard)
  // // step 2: simulate pay
  // @Post('pay')
  // async pay(@Body() body: { orderId: string }) {
  //   return await this.paymentsService.dataSource.transaction(async manager => {
  //     const order = await manager.getRepository(Order).findOne({ where: { id: body.orderId } });
  //     if (!order) throw new NotFoundException('Order not found');

  //     const invoice = await manager.getRepository(Invoice).findOne({ where: { orderId: order.id } });
  //     if (!invoice) throw new NotFoundException('Invoice not found');

  //     // mark order + invoice as paid
  //     order.status = OrderStatus.ACCEPTED;
  //     await manager.save(order);

  //     invoice.paymentStatus = PaymentStatus.PAID;
  //     await manager.save(invoice);

  //     // simulate platform wallet deposit
  //     let wallet = await manager.getRepository(Wallet).findOne({ where: { userId: 'platform' } });
  //     if (!wallet) {
  //       wallet = manager.getRepository(Wallet).create({ userId: 'platform', balance: 0 });
  //     }
  //     wallet.balance += Number(invoice.totalAmount);
  //     await manager.save(wallet);

  //     return {
  //       message: 'Payment successful',
  //       orderId: order.id,
  //       redirectUrl: `/payment/success?orderId=${order.id}`,
  //     };
  //   });
  // }
}
