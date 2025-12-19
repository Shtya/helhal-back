import { forwardRef, Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job, Proposal, User, Category, Order, Notification, Setting, Invoice, UserRelatedAccount } from 'entities/global.entity';
import { PaymentsModule } from 'src/payments/payments.module';


@Module({
  imports: [
    TypeOrmModule.forFeature([Job, Proposal, User, Category, Order, Notification, Setting, Invoice, UserRelatedAccount]),
    forwardRef(() => PaymentsModule), // <- add
  ],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule { }
