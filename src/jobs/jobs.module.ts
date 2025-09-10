import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job, Proposal, User, Category, Order, Notification, Setting } from 'entities/global.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Job, Proposal, User, Category, Order, Notification , Setting])],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}