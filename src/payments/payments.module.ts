import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment, Invoice, Order, User, PaymentMethod } from 'entities/global.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Invoice, Order, User, PaymentMethod])],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}