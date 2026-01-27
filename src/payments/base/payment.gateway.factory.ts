import { BadRequestException, Injectable } from "@nestjs/common";
import { PaymobPaymentService } from "./paymob.payment.service";
import { PaymentMethodType } from "entities/global.entity";
import { BasePaymentGateway } from "./BasePaymentGateway";

@Injectable()
export class PaymentGatewayFactory {
    constructor(
        private readonly paymobService: PaymobPaymentService,
        // Add other services here later (e.g., stripeService)
    ) { }

    getGateway(): BasePaymentGateway {
        return this.paymobService;

    }
}