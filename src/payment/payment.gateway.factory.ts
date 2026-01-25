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

    getGateway(method: PaymentMethodType): BasePaymentGateway {
        switch (method) {
            case PaymentMethodType.CARD:
            case PaymentMethodType.WALLET:
                return this.paymobService;
            // case PaymentMethodType.STRIPE: return this.stripeService;
            default:
                throw new BadRequestException(`No gateway found for method: ${method}, please use a supported payment method.`);
        }
    }
}