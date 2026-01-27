import { forwardRef, Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment, Invoice, Order, User, PaymentMethod, TransactionBillingInfo, UserSavedCard, Transaction } from 'entities/global.entity';
import { OrdersModule } from 'src/orders/orders.module';
import { AccountingModule } from 'src/accounting/accounting.module';
import { PaymobPaymentService } from 'src/payments/base/paymob.payment.service';
import { PaymentGatewayFactory } from 'src/payments/base/payment.gateway.factory';
import { SharedModule } from 'common/shared.module';


@Module({
  imports: [
    SharedModule,
    forwardRef(() => OrdersModule),     // <- add
    forwardRef(() => AccountingModule), // <- add
    TypeOrmModule.forFeature([Payment, Invoice, Transaction, TransactionBillingInfo, UserSavedCard, Order, User, PaymentMethod]),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymobPaymentService, PaymentGatewayFactory,],
  exports: [PaymentsService, PaymobPaymentService, PaymentGatewayFactory],
})
export class PaymentsModule { }