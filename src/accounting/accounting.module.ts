import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserBalance, Transaction, PaymentMethod, User, Order, Invoice, Setting, Wallet, Notification, UserBillingInfo, UserBankAccount } from 'entities/global.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserBalance, Transaction, PaymentMethod, User, Order, Invoice, Setting , Wallet , Notification, UserBillingInfo, 
    UserBankAccount])],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService], 
})
export class AccountingModule {}
