import { Controller, Post, Body, Param, Req, UseGuards, Get, Query } from '@nestjs/common';
import { RatingsService } from './rating.service';
import { JwtAuthGuard } from 'src/auth/guard/jwt-auth.guard';
import { RateBuyerDto, RateSellerDto } from 'dto/rating.dto';
import { AccessGuard } from 'src/auth/guard/access.guard';
import { RequireAccess } from 'decorators/access.decorator';
import { UserRole } from 'entities/global.entity';
import { decodeCursor, encodeCursor } from 'utils/crud.util';

@Controller('ratings')
export class RatingsController {
    constructor(private readonly ratingsService: RatingsService) { }


    @UseGuards(JwtAuthGuard, AccessGuard)
    @RequireAccess({
        roles: [UserRole.BUYER]
    })
    @Post('order/:id/rate-seller')
    async rateSeller(
        @Param('id') orderId: string,
        @Req() req: any,
        @Body() dto: RateSellerDto,
    ) {
        return this.ratingsService.rateSeller(orderId, req.user.id, dto);
    }


    @UseGuards(JwtAuthGuard, AccessGuard)
    @RequireAccess({
        roles: [UserRole.SELLER]
    })
    @Post('order/:id/rate-buyer')
    async rateBuyer(
        @Param('id') orderId: string,
        @Req() req: any,
        @Body() dto: RateBuyerDto,
    ) {
        return this.ratingsService.rateBuyer(orderId, req.user.id, dto);
    }


    @UseGuards(JwtAuthGuard)
    @Get('order/:id')
    async getOrderRating(@Param('id') orderId: string, @Req() req: any) {
        return this.ratingsService.getOrderRating(orderId, req.user.id);
    }

    @Get('service/:slug/reviews')
    async getServiceRatings(
        @Param('slug') serviceSlug: string,
        @Query('cursor') cursor?: string,
        @Query('limit') limit: number = 20
    ) {
        const safeLimit = Math.min(Number(limit) || 20, 20);
        const parsedCursor = decodeCursor(cursor);

        const result = await this.ratingsService.getServiceRatingsCursor(serviceSlug, parsedCursor, safeLimit);

        return {
            ...result,
            nextCursor: encodeCursor(result.nextCursor)
        };
    }

    @Get('user/:id/reviews')
    async getUserRatings(
        @Param('id') userId: string,
        @Query('cursor') cursor?: string,
        @Query('limit') limit: number = 20
    ) {
        const safeLimit = Math.min(Number(limit) || 20, 20);
        const parsedCursor = decodeCursor(cursor);

        // Fetches reviews received by this user (typically as a seller)
        const result = await this.ratingsService.getUserRatingsCursor(userId, parsedCursor, safeLimit);

        return {
            ...result,
            nextCursor: encodeCursor(result.nextCursor)
        };
    }
}