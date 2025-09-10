import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Service, Category, User, ServiceStatus, ServiceRequirement, ServiceReview } from 'entities/global.entity';

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Service)
    public serviceRepository: Repository<Service>,
    @InjectRepository(Category)
    public categoryRepository: Repository<Category>,
    @InjectRepository(User)
    public userRepository: Repository<User>,
    @InjectRepository(ServiceRequirement) private requirementRepository: Repository<ServiceRequirement>,
    @InjectRepository(ServiceReview) private reviewRepository: Repository<ServiceReview>,
  ) {}

  private slugify(raw?: string): string {
    if (!raw) return 'service';
    const base = raw
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-') // keep Arabic letters
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      .slice(0, 120); // leave room for suffixes
    return base || 'service';
  }

  async backfillServiceSlugs({ rewriteExisting = false, chunk = 500 }: { rewriteExisting?: boolean; chunk?: number } = {}): Promise<{ total: number; updated: number; skipped: number }> {
    // Prime a set with all existing slugs to avoid collisions
    const existingSlugs = await this.serviceRepository.find({ select: ['slug'] });
    const used = new Set(existingSlugs.map(s => s.slug).filter(Boolean));

    let skip = 0;
    let updated = 0;
    let skipped = 0;

    for (;;) {
      const rows = await this.serviceRepository.find({
        select: ['id', 'title', 'slug', 'created_at'],
        order: { created_at: 'ASC' },
        skip,
        take: chunk,
      });
      if (rows.length === 0) break;

      for (const row of rows) {
        if (row.slug && !rewriteExisting) {
          skipped++;
          continue;
        }

        const base = this.slugify(row.title);
        let candidate = base;
        let i = 2;

        while (used.has(candidate)) {
          candidate = `${base}-${i++}`;
        }
        used.add(candidate);

        // Use lightweight update to avoid loading full entity
        await this.serviceRepository.update({ id: row.id }, { slug: candidate });
        updated++;
      }

      skip += rows.length;
    }

    return { total: skip, updated, skipped };
  }

  async getServices(query: any) {
    const { page = 1, limit = 20, category, subcategory, minPrice, maxPrice, sortBy = 'created_at', sortOrder = 'DESC', status } = query;

    const skip = (page - 1) * limit;
    const whereClause: any = {};

    if (category) whereClause.categoryId = category;
    if (subcategory) whereClause.subcategoryId = subcategory;
    if (status) whereClause.status = status;
    if (minPrice || maxPrice) {
      whereClause.packages = Between(minPrice || 0, maxPrice || 999999);
    }

    const [services, total] = await this.serviceRepository.findAndCount({
      where: whereClause,
      relations: ['seller', 'category', 'subcategory'],
      order: { [sortBy]: sortOrder },
      skip,
      take: limit,
    });

    return {
      services,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getMyServices(query: any, userId: any) {
    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'DESC', status } = query;

    const skip = (page - 1) * limit;
    const whereClause: any = { seller: { id: userId } };
    if (status) whereClause.status = status;

    const [services, total] = await this.serviceRepository.findAndCount({
      where: whereClause,
      relations: ['seller', 'category'],
      order: { [sortBy]: sortOrder },
      skip,
      take: limit,
    });

    return {
      services,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getTopServices(query: any) {
    const { page = 1, limit = 20, category, subcategory } = query;

    const skip = (page - 1) * limit;
    const whereClause: any = {
      status: ServiceStatus.ACTIVE,
    };

    if (category) whereClause.categoryId = category;
    if (subcategory) whereClause.subcategoryId = subcategory;

    const [services, total] = await this.serviceRepository.findAndCount({
      where: whereClause,
      relations: ['seller', 'category', 'subcategory'],
      order: {
        ordersCount: 'DESC', // Primary: Most orders first
        clicks: 'DESC', // Secondary: Most clicks
        impressions: 'DESC', // Tertiary: Most impressions
        created_at: 'DESC', // Quaternary: Newest first
      },
      skip,
      take: limit,
    });

    return {
      services,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getCategoryFilterOptions(categorySlug: string, query: any) {
    // Find the category
    const category = await this.categoryRepository.findOne({
      where: { slug: categorySlug },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Build the base query for active services in this category
    const queryBuilder = this.serviceRepository.createQueryBuilder('service').leftJoinAndSelect('service.seller', 'seller').where('service.categoryId = :categoryId', { categoryId: category.id }).andWhere('service.status = :status', { status: ServiceStatus.ACTIVE });

    // Get all services to calculate counts
    const services = await queryBuilder.getMany();

    // Calculate filter counts
    const filterOptions = await this.calculateFilterCounts(services, category.id);

    return {
      category,
      filterOptions,
    };
  }

  private async calculateFilterCounts(services: Service[], categoryId: string) {
    // Get seller IDs from services
    const sellerIds = services.map(service => service.sellerId);

    // Get all sellers with their details
    const sellers = await this.userRepository.createQueryBuilder('user').leftJoinAndSelect('user.profiles', 'profile').where('user.id IN (:...sellerIds)', { sellerIds }).getMany();

    // Create seller map for quick lookup
    const sellerMap = new Map();
    sellers.forEach(seller => {
      sellerMap.set(seller.id, seller);
    });

    // Calculate counts for each filter
    const counts = {
      sellerLevels: {},
      sellerLanguages: {},
      sellerCountries: {},
      priceRanges: {
        u1000: 0,
        m1000_3600: 0,
        'h3600+': 0,
      },
      ratings: {
        'rating-4': 0, // 4+ stars
        'rating-3': 0, // 3+ stars
        'rating-2': 0, // 2+ stars
        'rating-1': 0, // 1+ stars
      },
      deliveryTimes: {
        u1000: 0, // Express 24 hrs
        m1000_3600: 0, // Up to 3 days
        'h3600+': 0, // Up to 7 days
      },
      revisions: {
        '1': 0,
        '2': 0,
        '3': 0,
        '4+': 0,
      },
      fastDelivery: 0,
      additionalRevision: 0,
    };

    // Calculate counts for each service
    for (const service of services) {
      const seller = sellerMap.get(service.sellerId);
      if (!seller) continue;

      // Seller level count
      if (seller && seller.sellerLevel != null) {
        const level = seller.sellerLevel;
        counts.sellerLevels[level] = (counts.sellerLevels[level] || 0) + 1;
      }

      // Seller languages count
      if (seller.languages && Array.isArray(seller.languages)) {
        seller.languages.forEach(lang => {
          counts.sellerLanguages[lang] = (counts.sellerLanguages[lang] || 0) + 1;
        });
      }

      // Seller countries count
      if (seller.country) {
        counts.sellerCountries[seller.country] = (counts.sellerCountries[seller.country] || 0) + 1;
      }

      // Price ranges count
      if (service.packages && Array.isArray(service.packages)) {
        const minPrice = Math.min(...service.packages.map(pkg => pkg.price || 0));

        if (minPrice <= 1000) counts.priceRanges.u1000++;
        if (minPrice >= 1000 && minPrice <= 3600) counts.priceRanges.m1000_3600++;
        if (minPrice >= 3600) counts.priceRanges['h3600+']++;
      }

      // Delivery times count
      if (service.packages && Array.isArray(service.packages)) {
        const minDeliveryTime = Math.min(...service.packages.map(pkg => pkg.deliveryTime || 0));

        if (minDeliveryTime <= 1) counts.deliveryTimes.u1000++;
        if (minDeliveryTime >= 1 && minDeliveryTime <= 3) counts.deliveryTimes.m1000_3600++;
        if (minDeliveryTime >= 3 && minDeliveryTime <= 7) counts.deliveryTimes['h3600+']++;
      }

      // Revisions count
      if (service.packages && Array.isArray(service.packages)) {
        const maxRevisions = Math.max(...service.packages.map(pkg => pkg.revisions || 0));

        if (maxRevisions >= 1) counts.revisions['1']++;
        if (maxRevisions >= 2) counts.revisions['2']++;
        if (maxRevisions >= 3) counts.revisions['3']++;
        if (maxRevisions >= 4) counts.revisions['4+']++;
      }

      // Fast delivery count
      if (service.fastDelivery) {
        counts.fastDelivery++;
      }

      // Additional revision count
      if (service.additionalRevision) {
        counts.additionalRevision++;
      }
    }

    // Calculate rating counts (this requires separate query for performance)
    const ratingCounts = await this.calculateRatingCounts(services.map(s => s.id));
    counts.ratings = { ...counts.ratings, ...ratingCounts };

    return counts;
  }

  private async calculateRatingCounts(serviceIds: string[]) {
    const ratingCounts = {
      'rating-4': 0,
      'rating-3': 0,
      'rating-2': 0,
      'rating-1': 0,
    };

    if (serviceIds.length === 0) return ratingCounts;

    // Get average ratings for all services
    const ratings = await this.reviewRepository.createQueryBuilder('review').select('review.serviceId', 'serviceId').addSelect('AVG(review.rating)', 'avgRating').where('review.serviceId IN (:...serviceIds)', { serviceIds }).groupBy('review.serviceId').getRawMany();

    // Count services by rating threshold
    ratings.forEach(rating => {
      const avgRating = parseFloat(rating.avgRating) || 0;

      if (avgRating >= 4) ratingCounts['rating-4']++;
      if (avgRating >= 3) ratingCounts['rating-3']++;
      if (avgRating >= 2) ratingCounts['rating-2']++;
      if (avgRating >= 1) ratingCounts['rating-1']++;
    });

    return ratingCounts;
  }

  async getCategoryServices(categorySlug: string, query: any) {
    const { page = 1, limit = 8, search = '', priceRange = '', rating = '', sortBy = '', sellerLevel = '', sellerAvailability = '', sellerSpeaks = '', sellerCountries = '', budget = '', deliveryTime = '', revisions = '', fastDelivery = '', additionalRevision = '', customBudget = '', customDeliveryTime = '' } = query;

    const skip = (page - 1) * limit;

    // Find the category
    const category = await this.categoryRepository.findOne({
      where: { slug: categorySlug },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Build the base query
    const queryBuilder = this.serviceRepository.createQueryBuilder('service').leftJoinAndSelect('service.seller', 'seller').leftJoinAndSelect('service.category', 'category').leftJoinAndSelect('service.subcategory', 'subcategory').where('service.categoryId = :categoryId', { categoryId: category.id }).andWhere('service.status = :status', { status: ServiceStatus.ACTIVE });

    // Search filter
    if (search) {
      queryBuilder.andWhere('(service.title ILIKE :search OR service.brief ILIKE :search OR service.searchTags::text ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    // Price range filter (from the simple select)
    if (priceRange) {
      const priceRanges = {
        u1000: [0, 1000],
        m1000_3600: [1000, 3600],
        'h3600+': [3600, 999999],
      };

      if (priceRanges[priceRange]) {
        const [min, max] = priceRanges[priceRange];
        queryBuilder.andWhere("EXISTS (SELECT 1 FROM jsonb_array_elements(service.packages) package WHERE (package->>'price')::numeric BETWEEN :minPrice AND :maxPrice)", {
          minPrice: min,
          maxPrice: max,
        });
      }
    }

    // Rating filter
    if (rating) {
      const minRating = parseInt(rating.replace('rating-', ''));

      // Subquery to get average rating for each service
      const subQuery = this.reviewRepository.createQueryBuilder('review').select('review.serviceId', 'serviceId').addSelect('AVG(review.rating)', 'avgRating').groupBy('review.serviceId').having('AVG(review.rating) >= :minRating', { minRating });

      queryBuilder.andWhere(`service.id IN (${subQuery.getQuery()})`);
      queryBuilder.setParameters(subQuery.getParameters());
    }

    // Budget filter (from the budget dropdown)
    if (budget) {
      if (budget === 'custom' && customBudget) {
        const customBudgetValue = parseInt(customBudget);
        queryBuilder.andWhere("EXISTS (SELECT 1 FROM jsonb_array_elements(service.packages) package WHERE (package->>'price')::numeric <= :customBudget)", {
          customBudget: customBudgetValue,
        });
      } else {
        const budgetRanges = {
          u1000: [0, 1000],
          m1000_3600: [1000, 3600],
          'h3600+': [3600, 999999],
        };

        if (budgetRanges[budget]) {
          const [min, max] = budgetRanges[budget];
          queryBuilder.andWhere("EXISTS (SELECT 1 FROM jsonb_array_elements(service.packages) package WHERE (package->>'price')::numeric BETWEEN :minBudget AND :maxBudget)", {
            minBudget: min,
            maxBudget: max,
          });
        }
      }
    }

    // Delivery time filter
    if (deliveryTime) {
      if (deliveryTime === 'custom' && customDeliveryTime) {
        const customTime = parseInt(customDeliveryTime);
        queryBuilder.andWhere("EXISTS (SELECT 1 FROM jsonb_array_elements(service.packages) package WHERE (package->>'deliveryTime')::numeric <= :customTime)", {
          customTime,
        });
      } else {
        const deliveryTimeRanges = {
          u1000: [0, 1], // Express 24 hrs (0-1 days)
          m1000_3600: [1, 3], // Up to 3 days
          'h3600+': [3, 7], // Up to 7 days
        };

        if (deliveryTimeRanges[deliveryTime]) {
          const [min, max] = deliveryTimeRanges[deliveryTime];
          queryBuilder.andWhere("EXISTS (SELECT 1 FROM jsonb_array_elements(service.packages) package WHERE (package->>'deliveryTime')::numeric BETWEEN :minTime AND :maxTime)", {
            minTime: min,
            maxTime: max,
          });
        }
      }
    }

    // Revisions filter (from packages)
    if (revisions) {
      const minRevisions = parseInt(revisions);
      queryBuilder.andWhere("EXISTS (SELECT 1 FROM jsonb_array_elements(service.packages) package WHERE (package->>'revisions')::numeric >= :minRevisions)", {
        minRevisions,
      });
    }

    // Fast delivery filter
    if (fastDelivery === 'true') {
      queryBuilder.andWhere('service.fastDelivery = :fastDelivery', { fastDelivery: true });
    }

    // Additional revision filter
    if (additionalRevision === 'true') {
      queryBuilder.andWhere('service.additionalRevision = :additionalRevision', { additionalRevision: true });
    }

    // Seller level filter
    if (sellerLevel) {
      const levels = Array.isArray(sellerLevel) ? sellerLevel : sellerLevel.split(',');
      console.log(await queryBuilder.getMany());
      queryBuilder.andWhere('seller.sellerLevel IN (:...levels)', { levels });
    }

    if (sellerAvailability) {
      const availability = Array.isArray(sellerAvailability) ? sellerAvailability : sellerAvailability.split(',');
      if (availability.includes('online')) {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        queryBuilder.andWhere('seller.lastActivity >= :fiveMinutesAgo', { fiveMinutesAgo });
      }
    }

    // Seller languages filter
    if (sellerSpeaks) {
      const languages = Array.isArray(sellerSpeaks) ? sellerSpeaks : sellerSpeaks.split(',');
      queryBuilder.andWhere('seller.languages::jsonb ?| array[:...languages]', { languages });
    }

    // Seller countries filter
    if (sellerCountries) {
      const countries = Array.isArray(sellerCountries) ? sellerCountries : sellerCountries.split(',');
      queryBuilder.andWhere('seller.country IN (:...countries)', { countries });
    }

    // Get total count before applying pagination
    const total = await queryBuilder.getCount();

    // Sorting
    const sortOptions = {
      s0: { field: 'service.created_at', direction: 'DESC' }, // Default: newest first
      s1: { field: 'minPrice', direction: 'ASC' }, // Price low to high
      s2: { field: 'maxPrice', direction: 'DESC' }, // Price high to low
      s3: { field: 'avgRating', direction: 'DESC' }, // Rating
      s4: { field: 'service.created_at', direction: 'DESC' }, // Newest
    };

    // For price sorting, we need to calculate min/max prices
    if (sortBy === 's1' || sortBy === 's2') {
      // Add subquery to get min/max prices for sorting
      queryBuilder
        .addSelect(
          `(
          SELECT MIN((package->>'price')::numeric) 
          FROM jsonb_array_elements(service.packages) package
        )`,
          'minPrice',
        )
        .addSelect(
          `(
          SELECT MAX((package->>'price')::numeric) 
          FROM jsonb_array_elements(service.packages) package
        )`,
          'maxPrice',
        );
    }

    // For rating sorting, we need to calculate average rating
    if (sortBy === 's3') {
      const ratingSubQuery = this.reviewRepository.createQueryBuilder('review').select('AVG(review.rating)', 'avgRating').where('review.serviceId = service.id');

      queryBuilder.addSelect(`(${ratingSubQuery.getQuery()})`, 'avgRating');
    }

    // Apply sorting
    if (sortBy && sortOptions[sortBy]) {
      const { field, direction } = sortOptions[sortBy];
      queryBuilder.orderBy(field, direction as 'ASC' | 'DESC');
    } else {
      queryBuilder.orderBy('service.created_at', 'DESC');
    }

    // Pagination
    queryBuilder.skip(skip).take(limit);

    // Execute query
    const services = await queryBuilder.getMany();

    // Calculate average ratings for services if needed
    if (sortBy === 's3' || rating) {
      for (const service of services) {
        const avgRating = await this.reviewRepository.createQueryBuilder('review').select('AVG(review.rating)', 'avgRating').where('review.serviceId = :serviceId', { serviceId: service.id }).getRawOne();

        service.rating = parseFloat(avgRating?.avgRating) || 0;
      }

      // If we're sorting by rating, we need to sort the results manually
      if (sortBy === 's3') {
        services.sort((a, b) => b.rating - a.rating);
      }
    }

    return {
      category,
      services,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    };
  }

  async getService(slug: string) {
    const service = await this.serviceRepository.findOne({
      where: { slug },
      relations: ['seller', 'category', 'subcategory', 'requirements', 'reviews'],
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    const relatedServices = await this.serviceRepository.find({
      where: service.subcategoryId ? { subcategoryId: service.subcategoryId } : { categoryId: service.categoryId },
      take: 4,
      relations: ['seller', 'category', 'subcategory'],
      order: { created_at: 'DESC' },
    });
    const filteredRelated = relatedServices.filter(s => s.id !== service.id).slice(0, 4);

    return {
      ...service,
      relatedServices: filteredRelated,
    };
  }

  async createService(userId: string, createServiceDto: any) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const service = this.serviceRepository.create({
      ...createServiceDto,
      seller: user,
      sellerId: userId,
    });

    return this.serviceRepository.save(service);
  }

  async updateService(userId: string, serviceId: string, updateServiceDto: any) {
    const service = await this.serviceRepository.findOne({
      where: { id: serviceId },
      relations: ['seller'],
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    if (service.sellerId !== userId) {
      throw new ForbiddenException('You can only update your own services');
    }

    Object.assign(service, updateServiceDto);
    return this.serviceRepository.save(service);
  }

  async deleteService(userId: string, serviceId: string) {
    const service = await this.serviceRepository.findOne({
      where: { id: serviceId },
      relations: ['seller'],
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    if (service.sellerId !== userId) {
      throw new ForbiddenException('You can only delete your own services');
    }

    return this.serviceRepository.remove(service);
  }

  async getServiceAnalytics(userId: string, serviceId: string) {
    const service = await this.serviceRepository.findOne({
      where: { id: serviceId, sellerId: userId },
    });

    if (!service) {
      throw new NotFoundException('Service not found or access denied');
    }

    // Calculate conversion rate
    const conversionRate = service.impressions > 0 ? (service.ordersCount / service.impressions) * 100 : 0;

    return {
      ...service,
      conversionRate: parseFloat(conversionRate.toFixed(2)),
    };
  }

  async trackImpression(serviceId: string) {
    await this.serviceRepository.increment({ id: serviceId }, 'impressions', 1);
    return { message: 'Impression tracked' };
  }

  async trackClick(serviceId: string) {
    await this.serviceRepository.increment({ id: serviceId }, 'clicks', 1);
    return { message: 'Click tracked' };
  }

  async getSellerServices(userId: string, page: number = 1) {
    const limit = 20;
    const skip = (page - 1) * limit;

    const [services, total] = await this.serviceRepository.findAndCount({
      where: { sellerId: userId },
      relations: ['category', 'subcategory'],
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return {
      services,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
}
