import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Between, In, MoreThan } from 'typeorm';
import { SavedSearch, Service, User, Notification } from 'entities/global.entity';

@Injectable()
export class SavedSearchesService {
  constructor(
    @InjectRepository(SavedSearch)
    private savedSearchRepository: Repository<SavedSearch>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
  ) { }

  async getUserSavedSearches(userId: string) {
    return this.savedSearchRepository.find({
      where: { userId },
      order: { created_at: 'DESC' },
    });
  }

  async getSavedSearch(userId: string, searchId: string) {
    const savedSearch = await this.savedSearchRepository.findOne({
      where: { id: searchId, userId },
    });

    if (!savedSearch) {
      throw new NotFoundException('Saved search not found');
    }

    return savedSearch;
  }

  async createSavedSearch(userId: string, createSavedSearchDto: any) {
    const { query, filters, notify = true } = createSavedSearchDto;

    const savedSearch = this.savedSearchRepository.create({
      userId,
      query,
      filters,
      notify,
    });

    return this.savedSearchRepository.save(savedSearch);
  }

  async updateSavedSearch(userId: string, searchId: string, updateSavedSearchDto: any) {
    const savedSearch = await this.getSavedSearch(userId, searchId);
    Object.assign(savedSearch, updateSavedSearchDto);
    return this.savedSearchRepository.save(savedSearch);
  }

  async deleteSavedSearch(userId: string, searchId: string) {
    const savedSearch = await this.getSavedSearch(userId, searchId);
    return this.savedSearchRepository.remove(savedSearch);
  }

  async getSearchNotifications(userId: string, searchId: string, page: number = 1) {
    const savedSearch = await this.getSavedSearch(userId, searchId);

    const limit = 20;
    const skip = (page - 1) * limit;

    const [notifications, total] = await this.notificationRepository.findAndCount({
      where: {
        userId,
        type: 'saved_search',
        relatedEntityType: 'saved_search',
        relatedEntityId: searchId,
      },
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    } as any);

    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async checkForNewServices(userId: string) {
    const savedSearches = await this.getUserSavedSearches(userId);
    const newServices = [];

    for (const search of savedSearches) {
      if (!search.notify) continue;

      const services = await this.findMatchingServices(search);

      for (const service of services) {
        // Check if notification already exists for this service and search
        const existingNotification = await this.notificationRepository.findOne({
          where: {
            userId,
            type: 'saved_search',
            relatedEntityType: 'service',
            relatedEntityId: service.id,
          },
        } as any);

        if (!existingNotification) {
          // Create notification
          const notification = this.notificationRepository.create({
            userId,
            type: 'saved_search',
            title: 'New Service Matching Your Search',
            message: `A new service "${service.title}" matches your saved search "${search.query}"`,
            relatedEntityType: 'service',
            relatedEntityId: service.id,
          } as any);

          await this.notificationRepository.save(notification);
          newServices.push(service);
        }
      }
    }

    return { newServices: newServices.length };
  }

  private async findMatchingServices(search: SavedSearch) {
    const { query, filters = {} } = search;
    const whereClause: any = { status: 'Active' };

    // Text search
    if (query) {
      whereClause.title = Like(`%${query}%`);
    }

    // Filter by category
    if (filters.category) {
      whereClause.categoryId = filters.category;
    }

    // Filter by subcategory
    if (filters.subcategory) {
      whereClause.subcategoryId = filters.subcategory;
    }

    // Filter by price range
    if (filters.minPrice || filters.maxPrice) {
      whereClause.packages = Between(
        filters.minPrice || 0,
        filters.maxPrice || 999999
      );
    }

    // Filter by tags
    if (filters.tags && filters.tags.length > 0) {
      whereClause.searchTags = In(filters.tags);
    }

    // Only services created after the search was saved
    whereClause.created_at = MoreThan(search.created_at);

    return this.serviceRepository.find({
      where: whereClause,
      take: 10, // Limit results
    });
  }

  async runScheduledSearchChecks() {
    // This would be called by a scheduled task (cron job)
    const allUsers = await this.userRepository.find();

    for (const user of allUsers) {
      await this.checkForNewServices(user.id);
    }
  }
}