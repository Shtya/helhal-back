import { Module } from '@nestjs/common';
import { SupportTicketsService } from './support-tickets.service';
import { SupportTicketsController } from './support-tickets.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportTicket, User, Notification } from 'entities/global.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SupportTicket, User, Notification])],
  controllers: [SupportTicketsController],
  providers: [SupportTicketsService],
})
export class SupportTicketsModule {}