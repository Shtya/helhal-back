import { forwardRef, Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job, Proposal, User, Category, Order, Notification, Setting, Invoice, UserRelatedAccount, Country, State } from 'entities/global.entity';


@Module({
  imports: [
    TypeOrmModule.forFeature([Job, Proposal, User, Category, Order, Notification, Setting, Invoice, UserRelatedAccount, Country, State]),
  ],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule { }
