import { Module } from '@nestjs/common';
import { BlogsService } from './blogs.service';
import { BlogsController } from './blogs.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Blog, BlogComment, BlogCategory, User, BlogLike } from 'entities/global.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Blog, BlogComment, BlogCategory, User, BlogLike])],
  controllers: [BlogsController],
  providers: [BlogsService],
})
export class BlogsModule {}