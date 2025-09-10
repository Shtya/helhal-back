import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceReview, Service, User, Order } from 'entities/global.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceReview, Service, User, Order])],
  controllers: [ReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}