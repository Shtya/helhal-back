import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order, Service, User, Invoice, Payment, Job, Proposal, Notification, Setting, Dispute, OrderSubmission, OrderChangeRequest, UserRelatedAccount } from 'entities/global.entity';
import { AccountingModule } from 'src/accounting/accounting.module';
import { PaymentModule } from 'src/payment/payment.module';


@Module({
  imports: [
    AccountingModule,
    PaymentModule,
    TypeOrmModule.forFeature([Order, Service, User, Invoice, Payment, Job, Proposal, Notification, Setting, Dispute, OrderSubmission, OrderChangeRequest, UserRelatedAccount]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule { }
