import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Favorite, Service, User } from 'entities/global.entity';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(Favorite)
    private favoriteRepository: Repository<Favorite>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async getUserFavorites(userId: string, page: number = 1) {
    const limit = 20;
    const skip = (page - 1) * limit;

    const [favorites, total] = await this.favoriteRepository.findAndCount({
      where: { userId },
      relations: ['service', 'service.seller', 'service.category'],
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return {
      favorites,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async addToFavorites(userId: string, serviceId: string) {
    const service = await this.serviceRepository.findOne({
      where: { id: serviceId, status: 'Active' },
    }as any);

    if (!service) {
      throw new NotFoundException('Service not found or not available');
    }

    // Check if already favorited
    const existingFavorite = await this.favoriteRepository.findOne({
      where: { userId, serviceId },
    });

    if (existingFavorite) {
      return existingFavorite;
    }

    const favorite = this.favoriteRepository.create({
      userId,
      serviceId,
    });

    return this.favoriteRepository.save(favorite);
  }

  async removeFromFavorites(userId: string, serviceId: string) {
    const favorite = await this.favoriteRepository.findOne({
      where: { userId, serviceId },
    });

    if (!favorite) {
      throw new NotFoundException('Favorite not found');
    }

    return this.favoriteRepository.remove(favorite);
  }

  async checkFavorite(userId: string, serviceId: string) {
    const favorite = await this.favoriteRepository.findOne({
      where: { userId, serviceId },
    });

    return { isFavorite: !!favorite };
  }

  async getFavoriteCount(serviceId: string) {
    return this.favoriteRepository.count({
      where: { serviceId },
    });
  }
}