import { Body, Controller, Logger, Post, Req } from "@nestjs/common";
import { PaymobPaymentService } from "./paymob.payment.service";


@Controller('payments/webhooks')
export class PaymentWebhookController {
  private readonly logger = new Logger('PaymobWebhook');
  constructor(
    private readonly paymobService: PaymobPaymentService,
  ) { }

  @Post('paymob')
  // Note: NO JwtAuthGuard here!
  async handlePaymobWebhook(@Body() body: any, @Req() req: any) {
    const timestamp = new Date().toISOString();

    this.logger.log(`\n\n🚀 [${timestamp}] PAYMOB WEBHOOK INBOUND`);
    this.logger.log('--------------------------------------------------');

    // 1. Log Headers (Useful to see the HMAC signature sent by Paymob)
    this.logger.log('HEADERS:', JSON.stringify(req.headers));

    // 2. Log Full Body (The meat of the transaction)
    this.logger.log('BODY:', JSON.stringify(body, null, 2));

    this.logger.log('--------------------------------------------------');

    // 3. Extract quick info for the console log summary
    const isSuccess = body?.obj?.success;
    const merchantOrderId = body?.obj?.order?.merchant_order_id;
    const paymobId = body?.obj?.id;

    this.logger.log(
      `Webhook Processed - Order: ${merchantOrderId} | Paymob ID: ${paymobId} | Success: ${isSuccess}`
    );

    // Return success to Paymob so they don't keep retrying the request
    return { status: 'received' };
  }
}