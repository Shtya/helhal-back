import { Module } from '@nestjs/common';
import { BlogCategoriesService } from './blog-categories.service';
import { BlogCategoriesController } from './blog-categories.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlogCategory, Blog, User } from 'entities/global.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BlogCategory, Blog, User])],
  controllers: [BlogCategoriesController],
  providers: [BlogCategoriesService],
})
export class BlogCategoriesModule {}