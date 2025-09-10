import { Module } from '@nestjs/common';
import { RecommendationService } from './recommendation.service';
import { RecommendationController } from './recommendation.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order, Recommendation, Service, User } from 'entities/global.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Recommendation, User, Service, Order])],
  controllers: [RecommendationController],
  providers: [RecommendationService],
})
export class RecommendationModule {}
