import { IsEmail, IsEnum, IsNotEmpty, IsString } from "class-validator";
import { PaymentMethodType } from "entities/global.entity";

export class BillingInfoDto {
    @IsString() @IsNotEmpty() firstName: string;
    @IsString() @IsNotEmpty() lastName: string;
    @IsEmail() email: string;
    @IsString() @IsNotEmpty() phoneNumber: string;
    @IsString() @IsNotEmpty() countryId: string;
    @IsString() @IsNotEmpty() stateId: string;
    @IsEnum(PaymentMethodType) @IsNotEmpty() paymentMethod: PaymentMethodType;
}

export interface UnifiedCheckout {
    userId: string;
    billingInfo: BillingInfoDto;
}
// payment-methods.enum.ts
export const getPaymobIntegrationId = (method: 'card' | 'wallet'): string | undefined => {
    const map: Record<string, string | undefined> = {
        card: process.env.PAYMOB_CARD_INTEGRATION_ID,
        wallet: process.env.PAYMOB_WALLET_INTEGRATION_ID,
    };
    return map[method];
};