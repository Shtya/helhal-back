import { Module } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { ReferralController } from './referral.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Referral, Affiliate, User, UserBalance, Transaction } from 'entities/global.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Referral, Affiliate, User, UserBalance, Transaction])],
  controllers: [ReferralController],
  providers: [ReferralService],
})
export class ReferralModule {}