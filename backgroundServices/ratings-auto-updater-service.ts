import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Order, OrderRating, OrderStatus } from 'entities/global.entity';
import { RatingsService } from 'src/rating/rating.service';
import { Repository, LessThan } from 'typeorm';

@Injectable()
export class RatingsAutoUpdaterService {
    private readonly logger = new Logger(RatingsAutoUpdaterService.name);

    constructor(
        @InjectRepository(OrderRating) private ratingRepo: Repository<OrderRating>,
        private ratingsService: RatingsService,
    ) { }

    // Run every day at 12:00 AM
    @Cron('0 0 0 * * *')
    async processExpiredRatings() {
        this.logger.log('Checking for delayed ratings...');

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 14);

        try {
            // Single query: Get ratings that are PRIVATE + linked to orders COMPLETED > 14 days ago
            const delayedRatings = await this.ratingRepo.createQueryBuilder('rating')
                .innerJoinAndSelect('rating.order', 'order') // Join the order to check its status/date [cite: 11]
                .where('rating.isPublic = :isPublic', { isPublic: false }) // Only private ratings [cite: 7]
                .andWhere('order.status = :status', { status: OrderStatus.COMPLETED }) // Only completed orders [cite: 1]

                .andWhere('order.completedAt <= :cutoffDate', { cutoffDate }) // [cite: 12]
                .getMany();

            this.logger.log(`Found ${delayedRatings.length} ratings to publish.`);

            for (const rating of delayedRatings) {
                try {
                    await this.ratingsService.checkAndPublish(rating, rating.order);
                    this.logger.log(`Published delayed rating for Order ${rating.orderId}`);
                } catch (err) {
                    this.logger.error(`Failed to publish rating for order ${rating.orderId}`, err.stack);
                }
            }
        } catch (err) {
            this.logger.error('Error processing delayed ratings', err);
        }
    }
}