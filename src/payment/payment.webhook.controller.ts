import { Body, Controller, Logger, Post, Req, UnauthorizedException } from "@nestjs/common";
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

    const fields = [
      "amount_cents",
      "created_at",
      "currency",
      "error_occured",
      "has_parent_transaction",
      "id",
      "integration_id",
      "is_3d_secure",
      "is_auth",
      "is_capture",
      "is_refunded",
      "is_standalone_payment",
      "is_voided",
      "order.id",
      "owner",
      "pending",
      "source_data.pan",
      "source_data.sub_type",
      "source_data.type",
      "success",
    ];
    const obj = body?.obj;
    // 2. Concatenate values based on the keys
    let concatenatedString = '';
    for (const field of fields) {
      const parts = field.split('.');
      let value = obj;
      for (const part of parts) {
        value = value?.[part];
      }
      concatenatedString += value ?? '';
    }
    const calculatedHmac = crypto.createHmac('sha512', this.hmac).update(concatenatedString).digest('hex');

    const isValid = calculatedHmac === body.hmac;

    if (isValid) {
      this.logger.error('❌ HMAC Verification Failed!');
      this.logger.debug(`Expected: ${this.hmac} | from ${concatenatedString} | Calculated: ${calculatedHmac}`);
      throw new UnauthorizedException('Invalid HMAC signature');
    }

    this.logger.log('✅ HMAC Verified Successfully');
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


