import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserBalance, Transaction, PaymentMethod, User, Order } from 'entities/global.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserBalance, Transaction, PaymentMethod, User, Order])],
  controllers: [AccountingController],
  providers: [AccountingService],
})
export class AccountingModule {}