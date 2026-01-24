import { Injectable, BadRequestException, NotFoundException, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CRUD } from 'common/crud.service';
import { RateBuyerDto, RateSellerDto } from 'dto/rating.dto';
import { Notification, Order, OrderRating, OrderStatus, SellerLevel, Service, User } from 'entities/global.entity';
import { Repository } from 'typeorm';
@Injectable()
export class RatingsService {
    private readonly logger = new Logger(RatingsService.name);

    constructor(
        @InjectRepository(OrderRating) private ratingRepo: Repository<OrderRating>,
        @InjectRepository(Order) private orderRepo: Repository<Order>,
        @InjectRepository(User) private userRepo: Repository<User>,
        @InjectRepository(Service) private serviceRepo: Repository<Service>,
        @InjectRepository(Notification) private notifRepo: Repository<Notification>,
    ) { }

    // Helper: Check if 14 days have passed 
    private isRatingWindowExpired(completedAt: Date): boolean {
        const fourteenDaysInMillis = 14 * 24 * 60 * 60 * 1000;
        return (Date.now() - completedAt.getTime()) > fourteenDaysInMillis;
    }

    // 1. Buyer Rates Seller
    async rateSeller(orderId: string, buyerId: string, dto: RateSellerDto) {
        const order = await this.orderRepo.findOne({ where: { id: orderId, buyerId }, relations: ['seller', 'service'] });
        if (!order) throw new NotFoundException('Order not found or you are not the buyer');

        // Check completion status 
        if (order.status !== OrderStatus.COMPLETED) throw new BadRequestException('Order is not completed');

        // Check 14 days window 
        if (this.isRatingWindowExpired(order.completedAt)) throw new BadRequestException('Rating period has expired (14 days)');

        let rating = await this.ratingRepo.findOne({ where: { orderId } });
        if (!rating) {
            rating = this.ratingRepo.create({ orderId, buyerId, sellerId: order.sellerId, serviceId: order.serviceId });
        }

        // Check if rating is public (cannot edit after public) 
        if (rating.isPublic) throw new BadRequestException('Cannot edit rating after it is public');

        // Calculate score 
        const sum = dto.quality + dto.communication + dto.skills + dto.availability + dto.cooperation;
        rating.buyer_total_score = sum / 5;

        // Map fields
        rating.buyer_rating_quality = dto.quality;
        rating.buyer_rating_communication = dto.communication;
        rating.buyer_rating_skills = dto.skills;
        rating.buyer_rating_availability = dto.availability;
        rating.buyer_rating_cooperation = dto.cooperation;
        rating.buyer_review_text = dto.reviewText;
        rating.buyer_rated_at = new Date();

        await this.ratingRepo.save(rating);

        // Check privacy and publish if possible 
        await this.checkAndPublish(rating, order);

        return { message: 'Seller rated successfully' };
    }

    // 2. Seller Rates Buyer
    async rateBuyer(orderId: string, sellerId: string, dto: RateBuyerDto) {
        const order = await this.orderRepo.findOne({ where: { id: orderId, sellerId }, relations: ['buyer'] });
        if (!order) throw new NotFoundException('Order not found or you are not the seller');

        if (order.status !== OrderStatus.COMPLETED) throw new BadRequestException('Order is not completed');
        if (this.isRatingWindowExpired(order.completedAt)) throw new BadRequestException('Rating period has expired (14 days)');

        let rating = await this.ratingRepo.findOne({ where: { orderId } });
        if (!rating) {
            rating = this.ratingRepo.create({ orderId, buyerId: order.buyerId, sellerId, serviceId: order.serviceId });
        }

        if (rating.isPublic) throw new BadRequestException('Cannot edit rating after it is public');

        // Calculate score 
        const sum = dto.communication + dto.cooperation + dto.availability + dto.clarity + dto.payment;
        rating.seller_total_score = sum / 5;

        // Map fields
        rating.seller_rating_communication = dto.communication;
        rating.seller_rating_cooperation = dto.cooperation;
        rating.seller_rating_availability = dto.availability;
        rating.seller_rating_clarity = dto.clarity;
        rating.seller_rating_payment = dto.payment;
        rating.seller_review_text = dto.reviewText;
        rating.seller_rated_at = new Date();

        await this.ratingRepo.save(rating);

        await this.checkAndPublish(rating, order);

        return { message: 'Buyer rated successfully' };
    }

    // Logic to publish ratings if conditions are met
    async checkAndPublish(rating: OrderRating, order: Order) {
        const bothRated = !!rating.buyer_rated_at && !!rating.seller_rated_at;

        const timeExpired = this.isRatingWindowExpired(order.completedAt);

        if ((bothRated || timeExpired) && !rating.isPublic) {
            rating.isPublic = true;
            await this.ratingRepo.save(rating);

            // Recalculate Averages 
            if (rating.buyer_total_score) {
                // Update Seller's stats (Buyer rated Seller)
                await this.updateUserStats(rating.sellerId, 'seller');
                if (rating.serviceId) await this.updateServiceStats(rating.serviceId);
            }
            if (rating.seller_total_score) {
                // Update Buyer's stats (Seller rated Buyer)
                await this.updateUserStats(rating.buyerId, 'buyer');
            }

            // Send Notifications for publishing
            const notif1 = this.notifRepo.create({
                userId: rating.buyerId, type: 'rating', title: 'Rating Published',
                message: `Reviews for order #${order.id} are now public.`,
                relatedEntityType: 'order', relatedEntityId: order.id
            });
            const notif2 = this.notifRepo.create({
                userId: rating.sellerId, type: 'rating', title: 'Rating Published',
                message: `Reviews for order #${order.id} are now public.`,
                relatedEntityType: 'order', relatedEntityId: order.id
            });
            await this.notifRepo.save([notif1, notif2]);
        }
    }

    // Recalculate User Average & Top Rated Logic
    private async updateUserStats(userId: string, role: 'buyer' | 'seller') {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) return;

        // Calculate Average
        const query = this.ratingRepo.createQueryBuilder('rating')
            .where('rating.isPublic = :isPublic', { isPublic: true });

        if (role === 'seller') {
            // Average of scores GIVEN TO the seller (by buyers)
            query.andWhere('rating.sellerId = :id', { id: userId })
                .andWhere('rating.buyer_total_score IS NOT NULL')
                .select('AVG(rating.buyer_total_score)', 'avg');
        } else {
            // Average of scores GIVEN TO the buyer (by sellers)
            query.andWhere('rating.buyerId = :id', { id: userId })
                .andWhere('rating.seller_total_score IS NOT NULL')
                .select('AVG(rating.seller_total_score)', 'avg');
        }

        const result = await query.getRawOne();
        const average = result && result.avg ? parseFloat(parseFloat(result.avg).toFixed(1)) : 0;
        user.rating = average;
        if (role === 'seller') {
            if (user.ordersCompleted >= 30 && average >= 4.7) {
                user.topRated = true;
                user.sellerLevel = SellerLevel.LVL2;
            } else {
            }
        }
        await this.userRepo.save(user);
    }

    // Recalculate Service Average 
    private async updateServiceStats(serviceId: string) {
        const result = await this.ratingRepo.createQueryBuilder('rating')
            .where('rating.serviceId = :id', { id: serviceId })
            .andWhere('rating.isPublic = :pub', { pub: true })
            .andWhere('rating.buyer_total_score IS NOT NULL')
            .select('AVG(rating.buyer_total_score)', 'avg')
            .getRawOne();

        const average = result && result.avg ? parseFloat(result.avg) : 0;
        await this.serviceRepo.update(serviceId, { rating: average });
    }


    async getOrderRating(orderId: string, userId: string) {
        const rating = await this.ratingRepo.findOne({ where: { orderId, } });
        if (!rating) return null;

        // 1. Authorization Check: If asker is not buyer or seller, they have no business here
        const isBuyer = userId === rating.buyerId;
        const isSeller = userId === rating.sellerId;

        if (!isBuyer && !isSeller && !rating.isPublic) {
            throw new UnauthorizedException('You are not authorized to view this rating');
        }

        // 2. Privacy Logic: If still private, strip the other party's data
        if (!rating.isPublic) {
            if (isBuyer) {
                // Asker is Buyer: Keep buyer data, hide seller data
                return {
                    ...rating,
                    seller_rating_communication: null,
                    seller_rating_cooperation: null,
                    seller_rating_availability: null,
                    seller_rating_clarity: null,
                    seller_rating_payment: null,
                    seller_review_text: null,
                    seller_total_score: null,
                    seller_rated_at: rating.seller_rated_at ? true : null // Just show IF they rated, not WHAT they rated
                };
            } else {
                // Asker is Seller: Keep seller data, hide buyer data
                return {
                    ...rating,
                    buyer_rating_quality: null,
                    buyer_rating_communication: null,
                    buyer_rating_skills: null,
                    buyer_rating_availability: null,
                    buyer_rating_cooperation: null,
                    buyer_review_text: null,
                    buyer_total_score: null,
                    buyer_rated_at: rating.buyer_rated_at ? true : null // Just show IF they rated
                };
            }
        }

        // 3. If Public: Return everything
        return rating;
    }

    async getServiceRatingsCursor(serviceSlug: string, cursor: { createdAt: Date; id: string }, limit: number) {
        const queryBuilder = this.ratingRepo.createQueryBuilder('rating')
            // 1. Join the service entity to access the slug
            .innerJoin('rating.service', 'service')
            .leftJoin('rating.buyer', 'buyer')
            .leftJoin('buyer.person', 'buyerPerson')
            .select([
                'rating.id',
                'rating.created_at',
                'rating.buyer_total_score',
                'rating.buyer_review_text',
                'rating.buyer_rated_at',
                'buyer.id',
                'buyer.profileImage',
                'buyerPerson.username',
                'buyerPerson.email'
            ])
            // 2. Filter by the slug from the joined service table
            .where('service.slug = :serviceSlug', { serviceSlug })
            .andWhere('rating.isPublic = :isPublic', { isPublic: true })
            .andWhere('rating.buyer_total_score IS NOT NULL');

        return CRUD.paginateCursor({
            queryBuilder,
            alias: 'rating',
            cursor,
            limit
        });
    }

    /**
     * Get paginated reviews for a specific User (Reviews received by this user)
     * Default: Reviews received as a SELLER (from buyers)
     */
    async getUserRatingsCursor(
        userId: string,
        cursor: { createdAt: Date; id: string },
        limit: number
    ) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');

        const isBuyer = user.role === 'buyer';
        const isSeller = user.role === 'seller';

        if (!isBuyer && !isSeller) return {
            items: [],
            nextCursor: null,
            hasMore: false
        }

        const queryBuilder = this.ratingRepo.createQueryBuilder('rating');

        // 1. Base selection for the rating itself
        queryBuilder.select([
            'rating.id',
            'rating.created_at',
            'rating.isPublic',
            'rating.buyer_total_score',
            'rating.buyer_review_text',
            'rating.buyer_rated_at',
            'rating.seller_total_score',
            'rating.seller_review_text',
            'rating.seller_rated_at',
        ]);

        // 2. Join Buyer Info
        queryBuilder
            .leftJoin('rating.buyer', 'buyer')
            .leftJoin('buyer.person', 'buyerPerson')
            .addSelect([
                'buyer.id',
                'buyer.profileImage',
                'buyerPerson.username',
                'buyerPerson.email'
            ]);

        // 3. Join Seller Info
        queryBuilder
            .leftJoin('rating.seller', 'seller')
            .leftJoin('seller.person', 'sellerPerson')
            .addSelect([
                'seller.id',
                'seller.profileImage',
                'sellerPerson.username',
                'sellerPerson.email'
            ]);

        // 4. Dynamic Filtering based on Role
        queryBuilder.andWhere('rating.isPublic = :isPublic', { isPublic: true });

        if (isSeller) {
            // User is the Seller: Get reviews GIVEN TO them BY Buyers
            queryBuilder.andWhere('rating.sellerId = :userId', { userId });
            queryBuilder.andWhere('rating.buyer_total_score IS NOT NULL');
        } else {
            // User is the Buyer: Get reviews GIVEN TO them BY Sellers
            queryBuilder.andWhere('rating.buyerId = :userId', { userId });
            queryBuilder.andWhere('rating.seller_total_score IS NOT NULL');
        }

        return CRUD.paginateCursor({
            queryBuilder,
            alias: 'rating',
            cursor,
            limit,
        });
    }
}