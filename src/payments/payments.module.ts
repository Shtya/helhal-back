import { forwardRef, Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment, Invoice, Order, User, PaymentMethod } from 'entities/global.entity';
import { OrdersModule } from 'src/orders/orders.module';
import { AccountingModule } from 'src/accounting/accounting.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Invoice, Order, User, PaymentMethod]),
    forwardRef(() => OrdersModule),     // <- add
    forwardRef(() => AccountingModule), // <- add
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
	exports: [PaymentsService], 
})
export class PaymentsModule {}