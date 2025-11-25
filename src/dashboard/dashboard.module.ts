import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Invoice, Order, Transaction, User } from 'entities/global.entity';
import { TypeOrmModule } from '@nestjs/typeorm';


@Module({
    imports: [
        TypeOrmModule.forFeature([User, Order, Transaction, Invoice]),
    ],
    controllers: [DashboardController],
    providers: [DashboardService],
    exports: [DashboardService], // optional
})
export class DashboardModule { }