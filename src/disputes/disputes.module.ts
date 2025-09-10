import { Module } from '@nestjs/common';
import { DisputesService } from './disputes.service';
import { DisputesController } from './disputes.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dispute, Order, User, Notification } from 'entities/global.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Dispute, Order, User, Notification])],
  controllers: [DisputesController],
  providers: [DisputesService],
})
export class DisputesModule {}