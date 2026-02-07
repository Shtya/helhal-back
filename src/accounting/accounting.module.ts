import { forwardRef, Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserBalance, Transaction, PaymentMethod, User, Order, Invoice, Setting, PlatformWallet, Notification, UserBillingInfo, UserBankAccount, Country, State, TransactionBillingInfo } from 'entities/global.entity';
import { WithdrawalCleanupService } from 'backgroundServices/withdrawal-cleanup-service';
import { PaymentsModule } from 'src/payments/payments.module';

@Module({
  imports: [
    forwardRef(() => PaymentsModule),
    TypeOrmModule.forFeature([
      UserBalance,
      Transaction,
      PaymentMethod,
      User,
      Order,
      Invoice,
      Setting,
      PlatformWallet,
      Notification,
      UserBillingInfo,
      TransactionBillingInfo,
      Country,
      State,
      UserBankAccount,
    ]),
  ],
  controllers: [AccountingController],
  providers: [AccountingService, WithdrawalCleanupService],
  exports: [AccountingService],
})
export class AccountingModule { }
