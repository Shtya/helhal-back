import { Body, Controller, Logger, Post, Query, Req, UnauthorizedException } from "@nestjs/common";
import { PaymobPaymentService } from "./paymob.payment.service";
import * as crypto from 'crypto';

@Controller('payments/webhooks')
export class PaymentWebhookController {
  private readonly logger = new Logger('PaymobWebhook');
  private readonly hmac: string = process.env.PAYMOB_HMAC_SECRET!;

  constructor(
    private readonly paymobService: PaymobPaymentService,
  ) { }

  @Post('paymob')
  async handlePaymobWebhook(
    @Body() body: any,
    @Query('hmac') queryHmac: string,
    @Req() req: any
  ) {
    this.logger.log(`Inbound Paymob Webhook: ${body.type} queryHmac`);

    try {
      await this.paymobService.processWebhook(body, queryHmac);
      return { status: 'success' };
    } catch (error) {
      this.logger.error(`Webhook processing failed: ${error.message}`);
      throw error;
    }
  }

}

