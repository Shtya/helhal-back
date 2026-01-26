// payment.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Order, Transaction, TransactionBillingInfo, User, UserSavedCard } from 'entities/global.entity';
import { PaymobPaymentService } from './paymob.payment.service';
import { PaymentGatewayFactory } from './payment.gateway.factory';
import { AccountingModule } from 'src/accounting/accounting.module';
import { PaymentWebhookController } from './payment.webhook.controller';

@Module({
    imports: [
        AccountingModule,
        // 1. Register Repositories used by Services
        TypeOrmModule.forFeature([
            Order,
            Transaction,
            TransactionBillingInfo,
            User,
            UserSavedCard
        ]),
    ],
    controllers: [PaymentWebhookController],
    providers: [
        PaymobPaymentService,
        PaymentGatewayFactory,
    ],
    exports: [
        PaymobPaymentService,
        PaymentGatewayFactory,
    ],
})
export class PaymentModule { }