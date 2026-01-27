import { forwardRef, Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order, Service, User, Invoice, Payment, Job, Proposal, Notification, Setting, Dispute, OrderSubmission, OrderChangeRequest, UserRelatedAccount, Transaction } from 'entities/global.entity';
import { AccountingModule } from 'src/accounting/accounting.module';
import { SharedModule } from 'common/shared.module';
import { PaymentsModule } from 'src/payments/payments.module';



@Module({
  imports: [
    AccountingModule,
    forwardRef(() => PaymentsModule),
    forwardRef(() => SharedModule),
    TypeOrmModule.forFeature([Transaction, Order, Service, User, Invoice, Payment, Job, Proposal, Notification, Setting, Dispute, OrderSubmission, OrderChangeRequest, UserRelatedAccount]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule { }
