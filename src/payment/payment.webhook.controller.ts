import { Body, Controller, Logger, Post, Req, UnauthorizedException } from "@nestjs/common";
import { PaymobPaymentService } from "./paymob.payment.service";
import * as crypto from 'crypto';

@Controller('payments/webhooks')
export class PaymentWebhookController {
  private readonly logger = new Logger('PaymobWebhook');
  private readonly hmac: string = process.env.PAYMOB_HMAC_SECRET!;
  private readonly secretKey: string = process.env.PAYMOB_SECRET_KEY!;
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
      let value: any;

      // Handle nested source_data fields
      if (field.includes('.')) {
        const [parent, child] = field.split('.');
        value = obj[parent]?.[child];
      } else if (field === 'order') {
        value = obj.order?.id; // Paymob HMAC uses the order ID specifically
      } else {
        value = obj[field];
      }

      // Concatenate if value exists, otherwise Paymob expects nothing (empty)
      concatenatedString += value !== undefined && value !== null ? value : '';
    }

    // 3. Verify HMAC

    const hash = crypto
      .createHmac('sha512', this.secretKey)
      .update(concatenatedString)
      .digest('hex');

    if (hash !== this.hmac) {
      this.logger.error('❌ HMAC Verification Failed!');
      this.logger.debug(`Expected: ${this.hmac} | from ${concatenatedString} | Calculated: ${hash}`);
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

