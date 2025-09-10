import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Recommendation, User, Service, Order } from 'entities/global.entity';

@Injectable()
export class RecommendationService {
  constructor(
    @InjectRepository(Recommendation)
    private recommendationRepository: Repository<Recommendation>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) {}

  async generatePersonalRecommendations(userId: string) {
    const user = await this.userRepository.findOne({ 
      where: { id: userId },
      relations: ['ordersAsBuyer', 'favorites']
    });

    // Simple recommendation algorithm based on user history
    const userOrders = user.ordersAsBuyer || [];
    const userFavorites = user.favorites || [];

    // Get categories from user history
    const preferredCategories = new Set();
    
    userOrders.forEach(order => {
      if (order.service?.categoryId) {
        preferredCategories.add(order.service.categoryId);
      }
    });

    userFavorites.forEach(favorite => {
      if (favorite.service?.categoryId) {
        preferredCategories.add(favorite.service.categoryId);
      }
    });

    // Generate recommendations based on preferred categories
    const recommendations = await this.serviceRepository
      .createQueryBuilder('service')
      .where('service.categoryId IN (:...categories)', { 
        categories: Array.from(preferredCategories) 
      })
      .andWhere('service.status = :status', { status: 'Active' })
      .orderBy('service.ordersCount', 'DESC')
      .limit(10)
      .getMany();

    // Store recommendations
    const recommendationRecords = recommendations.map(service => 
      this.recommendationRepository.create({
        userId,
        type: 'personal',
        reference: { serviceId: service.id, serviceTitle: service.title }
      })
    );

    await this.recommendationRepository.save(recommendationRecords);

    return recommendations;
  }

  async generateBusinessRecommendations(userId: string) {
    // Business recommendations based on trending services and industry trends
    const trendingServices = await this.serviceRepository
      .createQueryBuilder('service')
      .where('service.status = :status', { status: 'Active' })
      .orderBy('service.impressions', 'DESC')
      .addOrderBy('service.ordersCount', 'DESC')
      .limit(10)
      .getMany();

    // Store recommendations
    const recommendationRecords = trendingServices.map(service => 
      this.recommendationRepository.create({
        userId,
        type: 'business',
        reference: { 
          serviceId: service.id, 
          serviceTitle: service.title,
          reason: 'Trending in your industry' 
        }
      })
    );

    await this.recommendationRepository.save(recommendationRecords);

    return trendingServices;
  }

  async getUserRecommendations(userId: string, type?: string) {
    const whereClause: any = { userId };
    if (type) {
      whereClause.type = type;
    }

    return this.recommendationRepository.find({
      where: whereClause,
      order: { created_at: 'DESC' },
      take: 20
    });
  }
}