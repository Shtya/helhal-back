import { Module } from '@nestjs/common';
import { AbuseReportsService } from './abuse-reports.service';
import { AbuseReportsController } from './abuse-reports.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AbuseReport, User, Service, Notification } from 'entities/global.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AbuseReport, User, Service, Notification])],
  controllers: [AbuseReportsController],
  providers: [AbuseReportsService],
})
export class AbuseReportsModule {}