import { Controller, Get, Post, Put, Body, Param, UseGuards, Req, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { ReviewsService } from './reviews.service';

@Controller('reviews')
export class ReviewsController {
  constructor(private reviewsService: ReviewsService) {}

  @Get('service/:serviceId')
  async getServiceReviews(@Param('serviceId') serviceId: string, @Query('page') page: number = 1) {
    return this.reviewsService.getServiceReviews(serviceId, page);
  }

  @Get('seller/:sellerId')
  async getSellerReviews(@Param('sellerId') sellerId: string, @Query('page') page: number = 1) {
    return this.reviewsService.getSellerReviews(sellerId, page);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createReview(@Req() req, @Body() createReviewDto: any) {
    return this.reviewsService.createReview(req.user.id, createReviewDto);
  }

  @Put(':id/response')
  @UseGuards(JwtAuthGuard)
  async addSellerResponse(@Req() req, @Param('id') id: string, @Body() body: { response: string }) {
    return this.reviewsService.addSellerResponse(req.user.id, id, body.response);
  }
}