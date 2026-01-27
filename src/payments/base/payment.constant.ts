import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { TIMEOUT } from "dns";
import { PaymentMethodType } from "entities/global.entity";

export class BillingInfoDto {
    @IsString() @IsNotEmpty() firstName: string;
    @IsString() @IsNotEmpty() lastName: string;
    @IsEmail() email: string;
    @IsString() @IsNotEmpty() phoneNumber: string;
    @IsString() @IsNotEmpty() countryId: string;
    @IsString() @IsOptional() stateId: string;
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

// constants.ts
export const PAYMENT_TIMING = {
    LOCK_TTL: 10,           // 10 Seconds (Mutex)
    INTENTION_TTL: 1800,    // 30 Minutes (Paymob Expiration)
    CACHE_TTL: 1800,        // 30 Minutes (Result Cache)
    TIMEOUT_MS: 10000,    // 10 Seconds (Operation Timeout)
};

export const EVENT_TTL_SECONDS = 259200; // 72 hours
