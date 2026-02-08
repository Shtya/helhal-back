import { forwardRef, Module } from '@nestjs/common';
import { DisputesService } from './disputes.service';
import { DisputesController } from './disputes.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dispute, Order, User, Notification, Setting, DisputeMessage } from 'entities/global.entity';
import { AccountingModule } from 'src/accounting/accounting.module';
import { SharedModule } from 'common/shared.module';

@Module({
  imports: [forwardRef(() => SharedModule), TypeOrmModule.forFeature([Dispute, Order, User, Notification, Setting, DisputeMessage]), AccountingModule],
  controllers: [DisputesController],
  providers: [DisputesService],
})
export class DisputesModule { }
