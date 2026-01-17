import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceReview, Service, User, Order, OrderStatus } from 'entities/global.entity';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(ServiceReview)
    private reviewRepository: Repository<ServiceReview>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) { }

  async getServiceReviews(serviceId: string, page: number = 1) {
    const limit = 10;
    const skip = (page - 1) * limit;

    const [reviews, total] = await this.reviewRepository.findAndCount({
      where: { serviceId },
      relations: {
        seller: {
          person: true, // Fetches profile details for the seller
        },
        reviewer: true,
      },
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    // Calculate average rating
    const averageResult = await this.reviewRepository
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'average')
      .where('review.serviceId = :serviceId', { serviceId })
      .getRawOne();

    const averageRating = parseFloat(averageResult.average) || 0;

    return {
      reviews,
      averageRating,
      totalReviews: total,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getSellerReviews(sellerId: string, page: number = 1) {
    const limit = 10;
    const skip = (page - 1) * limit;

    const [reviews, total] = await this.reviewRepository.findAndCount({
      where: { sellerId },
      relations: {
        service: true,
        reviewer: {
          person: true // Joins the Person table to get the reviewer's name and avatar
        }
      },
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    // Calculate average rating
    const averageResult = await this.reviewRepository
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'average')
      .where('review.sellerId = :sellerId', { sellerId })
      .getRawOne();

    const averageRating = parseFloat(averageResult.average) || 0;

    return {
      reviews,
      averageRating,
      totalReviews: total,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async createReview(userId: string, createReviewDto: any) {
    const { serviceId, orderId, rating, comment } = createReviewDto;

    // Check if order exists and belongs to user
    const order = await this.orderRepository.findOne({
      where: { id: orderId, buyerId: userId, status: OrderStatus.COMPLETED },
      relations: ['service'],
    });

    if (!order) {
      throw new NotFoundException('Order not found or not completed');
    }

    if (order.serviceId !== serviceId) {
      throw new BadRequestException('Order does not match the service');
    }

    // Check if user already reviewed this order
    const existingReview = await this.reviewRepository.findOne({
      where: { orderId, reviewerId: userId },
    } as any);

    if (existingReview) {
      throw new BadRequestException('You have already reviewed this order');
    }

    const service = await this.serviceRepository.findOne({
      where: { id: serviceId },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    const review = this.reviewRepository.create({
      serviceId,
      reviewerId: userId,
      sellerId: service.sellerId,
      orderId,
      rating,
      comment,
    } as any);

    const savedReview = await this.reviewRepository.save(review);

    // Update service rating stats
    await this.updateServiceRatingStats(serviceId);

    return savedReview;
  }

  async addSellerResponse(userId: string, reviewId: string, response: string) {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
      relations: ['service'],
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Check if the user is the seller of the service
    const service = await this.serviceRepository.findOne({
      where: { id: review.serviceId, sellerId: userId },
    });

    if (!service) {
      throw new ForbiddenException('You can only respond to reviews of your own services');
    }

    if (review.sellerResponse) {
      throw new BadRequestException('You have already responded to this review');
    }

    review.sellerResponse = response;
    return this.reviewRepository.save(review);
  }

  private async updateServiceRatingStats(serviceId: string) {
    const stats = await this.reviewRepository
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'averageRating')
      .addSelect('COUNT(review.id)', 'totalReviews')
      .where('review.serviceId = :serviceId', { serviceId })
      .getRawOne();

    await this.serviceRepository.update(serviceId, {
      // You might want to store rating statistics in the service entity
      // For example: averageRating: parseFloat(stats.averageRating) || 0,
      // totalReviews: parseInt(stats.totalReviews) || 0
    });
  }
}