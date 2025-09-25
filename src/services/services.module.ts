import { Module } from '@nestjs/common';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Service, Category, User, ServiceRequirement, ServiceReview, Notification } from 'entities/global.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Service,Notification , Category, User, ServiceRequirement , ServiceReview])],
  controllers: [ServicesController],
  providers: [ServicesService],
})
export class ServicesModule {}