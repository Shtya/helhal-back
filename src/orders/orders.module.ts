import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order, Service, User, Invoice, Payment , Job, Proposal, Notification, Setting, Dispute  } from 'entities/global.entity';
import { AccountingModule } from 'src/accounting/accounting.module';
 
 
@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Service, User, Invoice, Payment, Job, Proposal, Notification, Setting , Dispute]),
    AccountingModule,  
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],  
})
export class OrdersModule {}
