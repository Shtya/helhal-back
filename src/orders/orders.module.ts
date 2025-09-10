import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order, Service, User, Invoice, Payment } from 'entities/global.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Order, Service, User, Invoice, Payment])],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}