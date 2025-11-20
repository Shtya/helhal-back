import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In, Between, LessThanOrEqual, MoreThanOrEqual, DataSource } from 'typeorm';
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
    private readonly dataSource: DataSource,
  ) { }

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
    // Calculate filter counts
    const filterOptions = await this.calculateFilterCountsBackendQB(category.id);

    return {
      category,
      filterOptions,
    };
  }


  async getAllFilterOptions(query?: any) {
    const filterOptions = await this.calculateFilterCountsBackendQB();

    return {
      filterOptions,
    };
  }


  private async calculateFilterCountsBackendQB(categoryId?: string) {
    const qb = this.dataSource
      .createQueryBuilder()
      .select('*')
      .from(`(
          WITH package_stats AS (
            SELECT 
              s.id,
              (
                SELECT MIN((pkg->>'price')::numeric)
                FROM jsonb_array_elements(s.packages) pkg
              ) AS min_price,
              (
                SELECT MIN((pkg->>'deliveryTime')::numeric)
                FROM jsonb_array_elements(s.packages) pkg
              ) AS min_time,
              (
                SELECT MAX((pkg->>'revisions')::int)
                FROM jsonb_array_elements(s.packages) pkg
              ) AS max_rev
            FROM services s
            WHERE s.status = 'Active'
              AND s.deleted_at IS NULL
              ${categoryId ? 'AND s.category_id = :categoryId' : ''}
          ),
          package_stats_values AS (
            SELECT
              SUM(CASE WHEN ps.min_price < 1000 THEN 1 ELSE 0 END) AS u1000,
              SUM(CASE WHEN ps.min_price BETWEEN 1000 AND 3600 THEN 1 ELSE 0 END) AS m1000_3600,
              SUM(CASE WHEN ps.min_price > 3600 THEN 1 ELSE 0 END) AS h3600,
              SUM(CASE WHEN ps.min_time <= 1 THEN 1 ELSE 0 END) AS dt_1day,
              SUM(CASE WHEN ps.min_time > 1 AND min_time <= 3 THEN 1 ELSE 0 END) AS dt_3days,
              SUM(CASE WHEN ps.min_time > 3 AND min_time <= 7 THEN 1 ELSE 0 END) AS dt_7days,
              SUM(CASE WHEN ps.max_rev >= 1 THEN 1 ELSE 0 END) AS rev_1,
              SUM(CASE WHEN ps.max_rev >= 2 THEN 1 ELSE 0 END) AS rev_2,
              SUM(CASE WHEN ps.max_rev >= 3 THEN 1 ELSE 0 END) AS rev_3,
              SUM(CASE WHEN ps.max_rev >= 4 THEN 1 ELSE 0 END) AS rev_4plus
            FROM package_stats ps
          ),
          level_counts AS (
            SELECT u.seller_level AS level, COUNT(*) AS count_level
            FROM services s
            INNER JOIN users u ON u.id = s.seller_id AND u.deleted_at IS NULL
            WHERE s.status = 'Active'
              AND s.deleted_at IS NULL
              ${categoryId ? 'AND s.category_id = :categoryId' : ''}
            GROUP BY u.seller_level
          ),
          seller_levels AS (
            SELECT jsonb_object_agg(level, count_level) AS seller_levels
            FROM level_counts
          ),
          lang_counts AS (
            SELECT lang.value::text AS language, COUNT(*) AS count_lang
            FROM services s
            INNER JOIN users u ON u.id = s.seller_id AND u.deleted_at IS NULL
            LEFT JOIN LATERAL jsonb_array_elements(u.languages) AS lang(value) ON TRUE
            WHERE s.status = 'Active'
              AND s.deleted_at IS NULL
              ${categoryId ? 'AND s.category_id = :categoryId' : ''}
            GROUP BY lang.value
          ),
          languages AS (
            SELECT jsonb_object_agg(language, count_lang) AS languages
            FROM lang_counts
          ),
          ratings AS (
            SELECT
              SUM(CASE WHEN s.rating >= 4 THEN 1 ELSE 0 END) AS rating_4,
              SUM(CASE WHEN s.rating >= 3 AND s.rating < 4 THEN 1 ELSE 0 END) AS rating_3,
              SUM(CASE WHEN s.rating >= 2 AND s.rating < 3 THEN 1 ELSE 0 END) AS rating_2,
              SUM(CASE WHEN s.rating >= 1 AND s.rating < 2 THEN 1 ELSE 0 END) AS rating_1
            FROM services s
            WHERE s.status = 'Active'
              AND s.deleted_at IS NULL
              ${categoryId ? 'AND s.category_id = :categoryId' : ''}
          ),
          country_counts AS (
            SELECT u.country AS key, COUNT(*) AS count
            FROM services s
            INNER JOIN users u ON u.id = s.seller_id AND u.deleted_at IS NULL
            WHERE s.status = 'Active'
              AND s.deleted_at IS NULL
              ${categoryId ? 'AND s.category_id = :categoryId' : ''}
            GROUP BY u.country
          ),
          seller_countries AS (
            SELECT jsonb_object_agg(key, count) AS countries
            FROM country_counts
          )
          SELECT 
            sl.seller_levels,
            lg.languages,
            psv.u1000,
            psv.m1000_3600,
            psv.h3600,
            psv.dt_1day,
            psv.dt_3days,
            psv.dt_7days,
            psv.rev_1,
            psv.rev_2,
            psv.rev_3,
            psv.rev_4plus,
            rt.rating_4,
            rt.rating_3,
            rt.rating_2,
            rt.rating_1,
            sc.countries
          FROM seller_levels sl
          CROSS JOIN languages lg
          CROSS JOIN package_stats_values psv
          CROSS JOIN ratings rt
          CROSS JOIN seller_countries sc
          )`, 'stats');


    if (categoryId) {
      qb.setParameter('categoryId', categoryId);
    }
    const raw = await qb.getRawOne();


    return {
      sellerLevels: raw.seller_levels || {},
      sellerLanguages: raw.languages || {},
      sellerCountries: raw.countries || {},
      priceRanges: {
        u1000: Number(raw.u1000 || 0),
        m1000_3600: Number(raw.m1000_3600 || 0),
        'h3600+': Number(raw.h3600 || 0),
      },
      ratings: {
        'rating-4': Number(raw.rating_4 || 0),
        'rating-3': Number(raw.rating_3 || 0),
        'rating-2': Number(raw.rating_2 || 0),
        'rating-1': Number(raw.rating_1 || 0),
      },
      deliveryTimes: {
        u1000: Number(raw.dt_1day || 0),
        m1000_3600: Number(raw.dt_3days || 0),
        'h3600+': Number(raw.dt_7days || 0),
      },
      revisions: {
        '1': Number(raw.rev_1 || 0),
        '2': Number(raw.rev_2 || 0),
        '3': Number(raw.rev_3 || 0),
        '4+': Number(raw.rev_4plus || 0),
      },
      fastDelivery: Number(raw.fast_delivery || 0),
      additionalRevision: Number(raw.additional_revision || 0),
    };
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
    const ratings = await this.reviewRepository.createQueryBuilder('review')
      .select('review.serviceId', 'serviceId')
      .addSelect('AVG(review.rating)', 'avgRating')
      .where('review.serviceId IN (:...serviceIds)', { serviceIds }).groupBy('review.serviceId').getRawMany();

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


    // Build the base query
    const queryBuilder = this.serviceRepository.createQueryBuilder('service')
      .select([
        'service.id',
        'service.created_at',
        `(service.gallery->0->>'url') AS cover`,
        'service.title',
        'service.brief',
        'service.rating',
        'service.slug',
        'service.metadata',
        'service.search_tags',
        'service.packages',
        'service.fastDelivery',
        'service.additionalRevision',
      ])
      .leftJoin('service.seller', 'seller')
      // select only specific seller fields
      .addSelect([
        'seller.id',
        'seller.profileImage',
        'seller.username',
        'seller.sellerLevel',
        'seller.lastActivity',
        'seller.languages',
        'seller.country',
      ])
      .leftJoin('service.category', 'category')
      .addSelect([
        'category.id',
        'category.name',
        'category.image',
        'category.slug',
      ])
      // .leftJoinAndSelect('service.subcategory', 'subcategory')
      // .where('service.categoryId = :categoryId', { categoryId: category.id })
      .andWhere('service.status = :status', { status: ServiceStatus.ACTIVE });

    let category
    if (categorySlug) {
      category = await this.categoryRepository.findOne({ where: { slug: categorySlug } });
      if (!category) throw new NotFoundException('Category not found');
      queryBuilder.andWhere('service.categoryId = :categoryId', { categoryId: category.id });
    }

    // Search filter
    if (search) {
      queryBuilder.andWhere('(service.title ILIKE :search OR service.brief ILIKE :search OR service.search_tags::text ILIKE :search)', {
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
      queryBuilder.andWhere('service.rating >= :minRating', { minRating });
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
    const totalPromise = queryBuilder.getCount();

    // Sorting
    const sortOptions = {
      s0: { field: 'service.created_at', direction: 'DESC' }, // Default: newest first
      s1: { field: 'min_price', direction: 'ASC' }, // Price low to high
      s2: { field: 'max_price', direction: 'DESC' }, // Price high to low
      s3: { field: 'rating', direction: 'DESC' }, // Rating
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
          'min_price',
        )
        .addSelect(
          `(
          SELECT MAX((package->>'price')::numeric) 
          FROM jsonb_array_elements(service.packages) package
        )`,
          'max_price',
        );
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
    // apply pagination
    const qbForData = queryBuilder.clone().skip(skip).take(limit);

    // run BOTH queries in parallel
    const [services, total] = await Promise.all([
      qbForData.getMany(),
      totalPromise,
    ]);

    return {
      category: category || null,
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

}
