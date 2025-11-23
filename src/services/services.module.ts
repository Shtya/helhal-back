import { Module } from '@nestjs/common';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Service, Category, User, ServiceRequirement, ServiceReview, Notification, ServiceClick } from 'entities/global.entity';
import { SessionService } from 'src/auth/session.service';

@Module({
  imports: [TypeOrmModule.forFeature([Service, Notification, Category, User, ServiceRequirement, ServiceReview, ServiceClick])],
  controllers: [ServicesController],
  providers: [ServicesService, SessionService],
})
export class ServicesModule { }