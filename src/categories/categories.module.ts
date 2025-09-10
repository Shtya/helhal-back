import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category, Service } from 'entities/global.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Category, Service])],
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}