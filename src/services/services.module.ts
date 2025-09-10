import { Module } from '@nestjs/common';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Service, Category, User, ServiceRequirement, ServiceReview } from 'entities/global.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Service, Category, User, ServiceRequirement , ServiceReview])],
  controllers: [ServicesController],
  providers: [ServicesService],
})
export class ServicesModule {}