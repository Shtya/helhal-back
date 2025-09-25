import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Service, Category, User, ServiceStatus, ServiceRequirement, ServiceReview, Notification } from 'entities/global.entity';

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Service)
    public serviceRepository: Repository<Service>,
    @InjectRepository(Category)
    public categoryRepository: Repository<Category>,
    @InjectRepository(User)
    public userRepository: Repository<User>,
    @InjectRepository(Notification) private notificationRepository: Repository<Notification>,
    @InjectRepository(ServiceReview) private reviewRepository: Repository<ServiceReview>,
  ) {}

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

  async getAllFilterOptions(query: any) {
    // Base: all ACTIVE services
    const qb = this.serviceRepository.createQueryBuilder('service').leftJoinAndSelect('service.seller', 'seller').andWhere('service.status = :status', { status: ServiceStatus.ACTIVE });

    const { search = '', priceRange = '', rating = '', sellerLevel = '', sellerAvailability = '', sellerSpeaks = '', sellerCountries = '', budget = '', deliveryTime = '', revisions = '', fastDelivery = '', additionalRevision = '', customBudget = '', customDeliveryTime = '' } = query ?? {};

    if (search) {
      qb.andWhere('(service.title ILIKE :search OR service.brief ILIKE :search OR service.searchTags::text ILIKE :search)', { search: `%${search}%` });
    }

    // Price range (simple select)
    if (priceRange) {
      const ranges: Record<string, [number, number]> = {
        u1000: [0, 1000],
        m1000_3600: [1000, 3600],
        'h3600+': [3600, 999999],
      };
      if (ranges[priceRange]) {
        const [min, max] = ranges[priceRange];
        qb.andWhere("EXISTS (SELECT 1 FROM jsonb_array_elements(service.packages) p WHERE (p->>'price')::numeric BETWEEN :minPrice AND :maxPrice)", { minPrice: min, maxPrice: max });
      }
    }

    // Budget (from budget dropdown; mirrors your category method)
    if (budget) {
      if (budget === 'custom' && customBudget) {
        const v = parseInt(customBudget);
        qb.andWhere("EXISTS (SELECT 1 FROM jsonb_array_elements(service.packages) p WHERE (p->>'price')::numeric <= :budget)", { budget: v });
      } else {
        const ranges: Record<string, [number, number]> = {
          u1000: [0, 1000],
          m1000_3600: [1000, 3600],
          'h3600+': [3600, 999999],
        };
        if (ranges[budget]) {
          const [min, max] = ranges[budget];
          qb.andWhere("EXISTS (SELECT 1 FROM jsonb_array_elements(service.packages) p WHERE (p->>'price')::numeric BETWEEN :minBudget AND :maxBudget)", { minBudget: min, maxBudget: max });
        }
      }
    }

    // Delivery time
    if (deliveryTime) {
      if (deliveryTime === 'custom' && customDeliveryTime) {
        const ct = parseInt(customDeliveryTime);
        qb.andWhere("EXISTS (SELECT 1 FROM jsonb_array_elements(service.packages) p WHERE (p->>'deliveryTime')::numeric <= :ct)", { ct });
      } else {
        const ranges: Record<string, [number, number]> = {
          u1000: [0, 1],
          m1000_3600: [1, 3],
          'h3600+': [3, 7],
        };
        if (ranges[deliveryTime]) {
          const [min, max] = ranges[deliveryTime];
          qb.andWhere("EXISTS (SELECT 1 FROM jsonb_array_elements(service.packages) p WHERE (p->>'deliveryTime')::numeric BETWEEN :minT AND :maxT)", { minT: min, maxT: max });
        }
      }
    }

    // Revisions
    if (revisions) {
      const minRevs = parseInt(revisions);
      qb.andWhere("EXISTS (SELECT 1 FROM jsonb_array_elements(service.packages) p WHERE (p->>'revisions')::numeric >= :minRevs)", { minRevs });
    }

    // Flags
    if (fastDelivery === 'true') {
      qb.andWhere('service.fastDelivery = true');
    }
    if (additionalRevision === 'true') {
      qb.andWhere('service.additionalRevision = true');
    }

    // Seller filters
    if (sellerLevel) {
      const levels = Array.isArray(sellerLevel) ? sellerLevel : String(sellerLevel).split(',');
      qb.andWhere('seller.sellerLevel IN (:...levels)', { levels });
    }

    if (sellerAvailability) {
      const availability = Array.isArray(sellerAvailability) ? sellerAvailability : String(sellerAvailability).split(',');
      if (availability.includes('online')) {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        qb.andWhere('seller.lastActivity >= :fiveMinutesAgo', { fiveMinutesAgo });
      }
    }

    if (sellerSpeaks) {
      const languages = Array.isArray(sellerSpeaks) ? sellerSpeaks : String(sellerSpeaks).split(',');
      qb.andWhere('seller.languages::jsonb ?| array[:...languages]', { languages });
    }

    if (sellerCountries) {
      const countries = Array.isArray(sellerCountries) ? sellerCountries : String(sellerCountries).split(',');
      qb.andWhere('seller.country IN (:...countries)', { countries });
    }

    // Rating (threshold)
    if (rating) {
      const minRating = parseInt(String(rating).replace('rating-', ''));
      const subQ = this.reviewRepository.createQueryBuilder('review').select('review.serviceId', 'serviceId').addSelect('AVG(review.rating)', 'avgRating').groupBy('review.serviceId').having('AVG(review.rating) >= :minRating', { minRating });

      qb.andWhere(`service.id IN (${subQ.getQuery()})`).setParameters(subQ.getParameters());
    }
    // ---- OPTIONAL filters end ----

    // Pull the rows and compute counts
    const services = await qb.getMany();
    const filterOptions = await this.calculateFilterCounts(services, null);

    return {
      category: null,
      scope: 'all',
      filterOptions,
    };
  }

  private async calculateFilterCounts(services: Service[], categoryId?: string) {
    // 1) Unique seller IDs; guard empty
    const sellerIds = Array.from(new Set(services.map(s => s.sellerId).filter(Boolean)));
    if (sellerIds.length === 0) {
      return {
        sellerLevels: {},
        sellerLanguages: {},
        sellerCountries: {},
        priceRanges: { u1000: 0, m1000_3600: 0, 'h3600+': 0 },
        ratings: { 'rating-4': 0, 'rating-3': 0, 'rating-2': 0, 'rating-1': 0 },
        deliveryTimes: { u1000: 0, m1000_3600: 0, 'h3600+': 0 },
        revisions: { '1': 0, '2': 0, '3': 0, '4+': 0 },
        fastDelivery: 0,
        additionalRevision: 0,
      };
    }

    // 2) Fetch only needed seller fields (NO profile join)
    const sellers = await this.userRepository.find({
      where: { id: In(sellerIds) },
      select: ['id', 'sellerLevel', 'languages', 'country'],
    });

    // 3) Seller lookup
    const sellerMap = new Map<string, Pick<User, 'id' | 'sellerLevel' | 'languages' | 'country'>>();
    for (const s of sellers) sellerMap.set(s.id, s);

    // 4) Init counts
    const counts = {
      sellerLevels: {} as Record<string, number>,
      sellerLanguages: {} as Record<string, number>,
      sellerCountries: {} as Record<string, number>,
      priceRanges: { u1000: 0, m1000_3600: 0, 'h3600+': 0 },
      ratings: { 'rating-4': 0, 'rating-3': 0, 'rating-2': 0, 'rating-1': 0 },
      deliveryTimes: { u1000: 0, m1000_3600: 0, 'h3600+': 0 },
      revisions: { '1': 0, '2': 0, '3': 0, '4+': 0 },
      fastDelivery: 0,
      additionalRevision: 0,
    };

    // 5) Iterate services (fix range overlaps + empty arrays)
    for (const service of services) {
      const seller = sellerMap.get(service.sellerId);
      if (!seller) continue;

      // Seller level
      if (seller.sellerLevel != null) {
        const lvl = String(seller.sellerLevel);
        counts.sellerLevels[lvl] = (counts.sellerLevels[lvl] || 0) + 1;
      }

      // Languages
      if (Array.isArray(seller.languages)) {
        for (const lang of seller.languages) {
          counts.sellerLanguages[lang] = (counts.sellerLanguages[lang] || 0) + 1;
        }
      }

      // Country
      if (seller.country) {
        counts.sellerCountries[seller.country] = (counts.sellerCountries[seller.country] || 0) + 1;
      }

      // Price ranges (use ELSE IF to avoid double-counting; guard empty)
      if (Array.isArray(service.packages) && service.packages.length > 0) {
        const prices = service.packages.map(p => Number(p?.price ?? 0)).filter(n => Number.isFinite(n));
        if (prices.length > 0) {
          const minPrice = Math.min(...prices);
          if (minPrice < 1000) counts.priceRanges.u1000++;
          else if (minPrice <= 3600) counts.priceRanges.m1000_3600++;
          else counts.priceRanges['h3600+']++;
        }
      }

      // Delivery times (same fix; guard empty)
      if (Array.isArray(service.packages) && service.packages.length > 0) {
        const times = service.packages.map(p => Number(p?.deliveryTime ?? 0)).filter(n => Number.isFinite(n));
        if (times.length > 0) {
          const minDelivery = Math.min(...times);
          if (minDelivery <= 1)
            counts.deliveryTimes.u1000++; // 24h
          else if (minDelivery <= 3)
            counts.deliveryTimes.m1000_3600++; // ≤3 days
          else if (minDelivery <= 7) counts.deliveryTimes['h3600+']++; // ≤7 days
          // ignore >7 unless you want a bucket for it
        }
      }

      // Revisions (guard empty; mutually independent buckets or cumulative? You were counting cumulatively.)
      if (Array.isArray(service.packages) && service.packages.length > 0) {
        const revs = service.packages.map(p => Number(p?.revisions ?? 0)).filter(n => Number.isFinite(n));
        if (revs.length > 0) {
          const maxRevisions = Math.max(...revs);
          if (maxRevisions >= 1) counts.revisions['1']++;
          if (maxRevisions >= 2) counts.revisions['2']++;
          if (maxRevisions >= 3) counts.revisions['3']++;
          if (maxRevisions >= 4) counts.revisions['4+']++;
        }
      }

      // Flags
      if (service.fastDelivery) counts.fastDelivery++;
      if (service.additionalRevision) counts.additionalRevision++;
    }

    // 6) Ratings (unchanged; just ensure IDs unique)
    const ratingCounts = await this.calculateRatingCounts(Array.from(new Set(services.map(s => s.id))));
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

    // Create service with pending status
    const service = this.serviceRepository.create({
      ...createServiceDto,
      seller: user,
      sellerId: userId,
      status: ServiceStatus.PENDING,
    });

    const savedService: any = await this.serviceRepository.save(service);

    // Find the first admin user
    const adminUser = await this.userRepository.findOne({
      where: { role: 'admin' },
      order: { created_at: 'ASC' },
    });

    if (adminUser) {
      const notification = this.notificationRepository.create({
        userId: adminUser.id,
        type: 'service_review',
        title: 'New Service Pending Approval',
        message: `A new service "${savedService.title}" was created and is pending your review.`,
        relatedEntityType: 'service',
        relatedEntityId: savedService.id,
      });

      await this.notificationRepository.save(notification);
    }

    return savedService;
  }

  async updateService(userId: string, serviceId: string, updateServiceDto: any) {
    const service = await this.serviceRepository.findOne({
      where: { id: serviceId },
      relations: ['seller'],
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (user.role != 'admin')
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

  // services.service.ts
  async getAllServices(query: any) {
    const { page = 1, limit = 8, search = '', priceRange = '', rating = '', sortBy = '', sellerLevel = '', sellerAvailability = '', sellerSpeaks = '', sellerCountries = '', budget = '', deliveryTime = '', revisions = '', fastDelivery = '', additionalRevision = '', customBudget = '', customDeliveryTime = '' } = query;

    const skip = (page - 1) * limit;

    // Base query: ALL categories, ACTIVE only
    const queryBuilder = this.serviceRepository.createQueryBuilder('service').leftJoinAndSelect('service.seller', 'seller').leftJoinAndSelect('service.category', 'category').leftJoinAndSelect('service.subcategory', 'subcategory').where('service.status = :status', { status: ServiceStatus.ACTIVE });

    // Search
    if (search) {
      queryBuilder.andWhere('(service.title ILIKE :search OR service.brief ILIKE :search OR service.searchTags::text ILIKE :search)', { search: `%${search}%` });
    }

    // Price range (simple select)
    if (priceRange) {
      const priceRanges: Record<string, [number, number]> = {
        u1000: [0, 1000],
        m1000_3600: [1000, 3600],
        'h3600+': [3600, 999999],
      };
      if (priceRanges[priceRange]) {
        const [min, max] = priceRanges[priceRange];
        queryBuilder.andWhere("EXISTS (SELECT 1 FROM jsonb_array_elements(service.packages) package WHERE (package->>'price')::numeric BETWEEN :minPrice AND :maxPrice)", { minPrice: min, maxPrice: max });
      }
    }

    // Rating threshold
    if (rating) {
      const minRating = parseInt(String(rating).replace('rating-', ''));
      const subQuery = this.reviewRepository.createQueryBuilder('review').select('review.serviceId', 'serviceId').addSelect('AVG(review.rating)', 'avgRating').groupBy('review.serviceId').having('AVG(review.rating) >= :minRating', { minRating });

      queryBuilder.andWhere(`service.id IN (${subQuery.getQuery()})`);
      queryBuilder.setParameters(subQuery.getParameters());
    }

    // Budget (dropdown)
    if (budget) {
      if (budget === 'custom' && customBudget) {
        const customBudgetValue = parseInt(customBudget);
        queryBuilder.andWhere("EXISTS (SELECT 1 FROM jsonb_array_elements(service.packages) package WHERE (package->>'price')::numeric <= :customBudget)", { customBudget: customBudgetValue });
      } else {
        const budgetRanges: Record<string, [number, number]> = {
          u1000: [0, 1000],
          m1000_3600: [1000, 3600],
          'h3600+': [3600, 999999],
        };
        if (budgetRanges[budget]) {
          const [min, max] = budgetRanges[budget];
          queryBuilder.andWhere("EXISTS (SELECT 1 FROM jsonb_array_elements(service.packages) package WHERE (package->>'price')::numeric BETWEEN :minBudget AND :maxBudget)", { minBudget: min, maxBudget: max });
        }
      }
    }

    // Delivery time
    if (deliveryTime) {
      if (deliveryTime === 'custom' && customDeliveryTime) {
        const customTime = parseInt(customDeliveryTime);
        queryBuilder.andWhere("EXISTS (SELECT 1 FROM jsonb_array_elements(service.packages) package WHERE (package->>'deliveryTime')::numeric <= :customTime)", { customTime });
      } else {
        const deliveryTimeRanges: Record<string, [number, number]> = {
          u1000: [0, 1], // ≤ 1 day
          m1000_3600: [1, 3], // ≤ 3 days
          'h3600+': [3, 7], // ≤ 7 days
        };
        if (deliveryTimeRanges[deliveryTime]) {
          const [min, max] = deliveryTimeRanges[deliveryTime];
          queryBuilder.andWhere("EXISTS (SELECT 1 FROM jsonb_array_elements(service.packages) package WHERE (package->>'deliveryTime')::numeric BETWEEN :minTime AND :maxTime)", { minTime: min, maxTime: max });
        }
      }
    }

    // Revisions
    if (revisions) {
      const minRevisions = parseInt(revisions);
      queryBuilder.andWhere("EXISTS (SELECT 1 FROM jsonb_array_elements(service.packages) package WHERE (package->>'revisions')::numeric >= :minRevisions)", { minRevisions });
    }

    // Flags
    if (fastDelivery === 'true') {
      queryBuilder.andWhere('service.fastDelivery = :fastDelivery', { fastDelivery: true });
    }
    if (additionalRevision === 'true') {
      queryBuilder.andWhere('service.additionalRevision = :additionalRevision', { additionalRevision: true });
    }

    // Seller filters
    if (sellerLevel) {
      const levels = Array.isArray(sellerLevel) ? sellerLevel : String(sellerLevel).split(',');
      queryBuilder.andWhere('seller.sellerLevel IN (:...levels)', { levels });
    }

    if (sellerAvailability) {
      const availability = Array.isArray(sellerAvailability) ? sellerAvailability : String(sellerAvailability).split(',');
      if (availability.includes('online')) {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        queryBuilder.andWhere('seller.lastActivity >= :fiveMinutesAgo', { fiveMinutesAgo });
      }
    }

    if (sellerSpeaks) {
      const languages = Array.isArray(sellerSpeaks) ? sellerSpeaks : String(sellerSpeaks).split(',');
      queryBuilder.andWhere('seller.languages::jsonb ?| array[:...languages]', { languages });
    }

    if (sellerCountries) {
      const countries = Array.isArray(sellerCountries) ? sellerCountries : String(sellerCountries).split(',');
      queryBuilder.andWhere('seller.country IN (:...countries)', { countries });
    }

    // Total *before* pagination
    const total = await queryBuilder.getCount();

    // Sorting
    const sortOptions: Record<string, { field: string; direction: 'ASC' | 'DESC' }> = {
      s0: { field: 'service.created_at', direction: 'DESC' }, // default newest
      s1: { field: 'minPrice', direction: 'ASC' }, // price low→high
      s2: { field: 'maxPrice', direction: 'DESC' }, // price high→low
      s3: { field: 'avgRating', direction: 'DESC' }, // rating
      s4: { field: 'service.created_at', direction: 'DESC' }, // newest
    };

    if (sortBy === 's1' || sortBy === 's2') {
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

    if (sortBy === 's3') {
      const ratingSubQuery = this.reviewRepository.createQueryBuilder('review').select('AVG(review.rating)', 'avgRating').where('review.serviceId = service.id');

      queryBuilder.addSelect(`(${ratingSubQuery.getQuery()})`, 'avgRating');
    }

    if (sortBy && sortOptions[sortBy]) {
      const { field, direction } = sortOptions[sortBy];
      queryBuilder.orderBy(field, direction);
    } else {
      queryBuilder.orderBy('service.created_at', 'DESC');
    }

    // Pagination
    queryBuilder.skip(skip).take(limit);

    // Execute
    const services = await queryBuilder.getMany();

    // Post-process ratings if needed
    if (sortBy === 's3' || rating) {
      for (const svc of services) {
        const avgRow = await this.reviewRepository.createQueryBuilder('review').select('AVG(review.rating)', 'avgRating').where('review.serviceId = :serviceId', { serviceId: svc.id }).getRawOne();
        (svc as any).rating = parseFloat(avgRow?.avgRating) || 0;
      }
      if (sortBy === 's3') {
        services.sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0));
      }
    }

    return {
      category: null, // keep response shape parallel to category version
      services,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    };
  }
}
