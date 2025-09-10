import { Module } from '@nestjs/common';
import { ServiceRequirementsService } from './service-requirements.service';
import { ServiceRequirementsController } from './service-requirements.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceRequirement, Service, User } from 'entities/global.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceRequirement, Service, User])],
  controllers: [ServiceRequirementsController],
  providers: [ServiceRequirementsService],
})
export class ServiceRequirementsModule {}