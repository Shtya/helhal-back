import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Report, Order, Service, User, Transaction, UserBalance } from 'entities/global.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Report, Order, Service, User, Transaction, UserBalance])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}