import { Controller, Get, UseGuards, Req, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RecommendationService } from './recommendation.service';

@Controller('recommendations')
@UseGuards(JwtAuthGuard)
export class RecommendationController {
  constructor(private recommendationService: RecommendationService) {}

  @Get('personal')
  async getPersonalRecommendations(@Req() req) {
    return this.recommendationService.generatePersonalRecommendations(req.user.id);
  }

  @Get('business')
  async getBusinessRecommendations(@Req() req) {
    return this.recommendationService.generateBusinessRecommendations(req.user.id);
  }

  @Get('history')
  async getRecommendationHistory(@Req() req, @Query('type') type?: string) {
    return this.recommendationService.getUserRecommendations(req.user.id, type);
  }
}