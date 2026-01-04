import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In, Between, LessThanOrEqual, MoreThanOrEqual, DataSource, MoreThan } from 'typeorm';
import { Service, Category, User, ServiceStatus, ServiceRequirement, ServiceReview, Notification, ServiceClick, Country, State } from 'entities/global.entity';
import { join } from 'path';
import { promises as fsp } from 'fs';
import { SessionService } from 'src/auth/session.service';
import { PermissionBitmaskHelper } from 'src/auth/permission-bitmask.helper';
import { PermissionDomains, Permissions } from 'entities/permissions';
import { formatSearchTerm } from 'utils/search.helper';

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Service)
    public serviceRepository: Repository<Service>,
    @InjectRepository(Category)
    public categoryRepository: Repository<Category>,
    @InjectRepository(ServiceRequirement)
    public serviceRequirementRepository: Repository<ServiceRequirement>,
    @InjectRepository(User)
    public userRepository: Repository<User>,
    @InjectRepository(ServiceClick)
    public serviceClickRepository: Repository<ServiceClick>,
    @InjectRepository(Notification) private notificationRepository: Repository<Notification>,
    @InjectRepository(ServiceReview) private reviewRepository: Repository<ServiceReview>,
    @InjectRepository(Country)
    public countryRepository: Repository<Country>,
    @InjectRepository(State)
    public stateRepository: Repository<State>,
    private readonly dataSource: DataSource,
    public sessionService: SessionService,
  ) { }

  async getServices(query: any) {
    const { page = 1, limit = 20, category, subcategory, minPrice, maxPrice, sortBy = 'created_at', sortOrder = 'DESC', status, } = query;

    const skip = (page - 1) * limit;
    const whereClause: any = {};

    if (category) whereClause.categoryId = category;
    if (subcategory) whereClause.subcategoryId = subcategory;
    // if (status) whereClause.status = status;
    whereClause.status = ServiceStatus.ACTIVE;
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
              AND u.seller_level IS NOT NULL
            GROUP BY u.seller_level
          ),
          seller_levels AS (
            SELECT jsonb_object_agg(level, count_level) AS seller_levels
            FROM level_counts
          ),
          lang_counts AS (
            SELECT lang.value #>> '{}' AS language, COUNT(*) AS count_lang
            FROM services s
            INNER JOIN users u ON u.id = s.seller_id AND u.deleted_at IS NULL
            LEFT JOIN LATERAL jsonb_array_elements(u.languages) AS lang(value) ON TRUE
            WHERE s.status = 'Active'
              AND s.deleted_at IS NULL
              ${categoryId ? 'AND s.category_id = :categoryId' : ''}
              AND lang.value IS NOT NULL
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
             SELECT c.name AS key, COUNT(*) AS count
            FROM services s
            INNER JOIN users u ON u.id = s.seller_id AND u.deleted_at IS NULL
             INNER JOIN countries c ON c.id = u.country_id 
            WHERE s.status = 'Active'
              AND s.deleted_at IS NULL
              ${categoryId ? 'AND s.category_id = :categoryId' : ''}
              AND c.name IS NOT NULL
            GROUP BY c.name
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
    const { page = 1, limit = 8, search = '', priceRange = '', rating = '', sortBy = '', sellerLevel = '', sellerAvailability = '', sellerSpeaks = '', sellerCountries = '', budget = '', deliveryTime = '', revisions = '', fastDelivery = '', additionalRevision = '', customBudget = '', customDeliveryTime = '', country = '', state = "" } = query;

    const skip = (page - 1) * limit;


    // Build the base query
    const queryBuilder = this.serviceRepository.createQueryBuilder('service')
      .select([
        'service.id',
        'service.created_at',
        'service.gallery',
        'service.title',
        'service.brief',
        'service.rating',
        'service.slug',
        'service.metadata',
        'service.searchTags',
        'service.packages',
        'service.fastDelivery',
        'service.additionalRevision',
        'service.maxPrice',
        'service.minPrice',
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
        'seller.countryId',
      ])
      .leftJoin('seller.country', 'country')
      .addSelect([
        'country.id',
        'country.name'
      ])
      .leftJoin('service.category', 'category')
      .addSelect([
        'category.id',
        'category.name_en',
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
    const { formattedSearch, rawSearch } = formatSearchTerm(search);

    if (formattedSearch && rawSearch) {
      queryBuilder.andWhere(
        `(
      service.search_vector @@ to_tsquery('english', :formattedSearch) OR 
      service.search_vector @@ plainto_tsquery('arabic', normalize_arabic(:rawSearch))
    )`,
        { formattedSearch, rawSearch }
      );
    }

    // ---  filter ---
    if (country) {
      queryBuilder.andWhere('service.countryId = :countryId', { countryId: country });
    }

    if (state) {
      queryBuilder.andWhere('service.stateId = :stateId', { stateId: state });
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
        queryBuilder.andWhere("EXISTS (SELECT 1 FROM jsonb_array_elements(service.packages) package WHERE (package->>'price')::numeric BETWEEN :minPriceVal AND :maxPriceVal)", {
          minPriceVal: min,
          maxPriceVal: max,
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

    // Seller countries filter (case-insensitive)
    if (sellerCountries) {
      const countries = Array.isArray(sellerCountries) ? sellerCountries : sellerCountries.split(',');
      queryBuilder.andWhere('LOWER(country.name_en) IN (:...countries)', {
        countries: countries.map(c => c.toLowerCase()),
      });
    }

    // Get total count before applying pagination
    const totalPromise = queryBuilder.getCount();

    // Sorting
    const sortOptions = {
      s0: { field: 'service.created_at', direction: 'DESC' }, // Default: newest first
      s1: { field: 'service.minPrice', direction: 'ASC' }, // Price low to high
      s2: { field: 'service.maxPrice', direction: 'DESC' }, // Price high to low
      s3: { field: 'service.rating', direction: 'DESC' }, // Rating
      s4: { field: 'service.created_at', direction: 'DESC' }, // Newest
    };

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

  async getService(slug: string, userId: string, req: any) {
    const service = await this.serviceRepository.findOne({
      where: { slug },
      relations: ['seller', 'category', 'subcategory', 'requirements', 'reviews', 'country', 'state'],
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    const user = req?.user;

    // Only allow inactive service preview for the owner or admin
    const hasPermission = PermissionBitmaskHelper.has(user?.permissions?.services, Permissions.Services.View)
    const isOwnerOrAdmin = service.sellerId === userId || user?.role === 'admin' || hasPermission;
    if (service.status !== ServiceStatus.ACTIVE && !isOwnerOrAdmin) {
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

  private createSlug(slug: string) {
    return slug
      .toLowerCase()
      .trim()
      // 1. Replace everything that is NOT a Unicode Letter/Number, space, or dash with empty string
      // The 'u' flag at the end is REQUIRED for Unicode support
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      // 2. Replace spaces with dashes
      .replace(/\s+/g, '-')
      // 3. Remove consecutive dashes
      .replace(/-+/g, '-')
      // 4. Remove leading/trailing dashes (optional but recommended)
      .replace(/^-+|-+$/g, '');
  }
  async checkServiceTitleUniqueness(
    title: string,
    userId: string
  ) {
    const slug = this.createSlug(title);

    const existingService = await this.serviceRepository.findOne({
      where: { slug },
    });

    if (!existingService) {
      return {
        isUnique: true,
        ownedByCurrentUser: false,
        message: 'Title is available',
      };
    }

    const ownedByCurrentUser = existingService.sellerId === userId;

    return {
      isUnique: false,
      ownedByCurrentUser,
      message: ownedByCurrentUser
        ? 'You already have a service with this title'
        : 'This title is already used by another seller',
    };
  }

  async createService(userId: string, createServiceDto: any) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate slug from title
    const tempSlug = this.createSlug(createServiceDto.title);

    // Check if slug already exists
    const existingService = await this.serviceRepository.findOne({ where: { slug: tempSlug } });
    if (existingService) {
      throw new BadRequestException(
        `Service with title "${createServiceDto.title}" already exists. Please choose a different title.`
      );
    }

    if (createServiceDto.countryId) {
      const country = await this.countryRepository.findOne({ where: { id: createServiceDto.countryId } } as any);
      if (!country) throw new NotFoundException('Country not found');
    }
    else {
      throw new NotFoundException('Country not found');
    }


    if (createServiceDto.stateId) {
      const state = await this.stateRepository.findOne({ where: { id: createServiceDto.stateId, countryId: createServiceDto.countryId } } as any);
      if (!state) throw new NotFoundException('State not found or does not belong to the selected country');
    } else {
      delete createServiceDto.stateId;
    }


    // Create service with pending status
    const service = this.serviceRepository.create({
      ...createServiceDto,
      seller: user,
      sellerId: userId,
      status: ServiceStatus.PENDING,
    });

    const savedService: any = await this.serviceRepository.save(service);

    // Save requirements if provided
    if (createServiceDto.requirements?.length) {
      const requirements = createServiceDto.requirements.map(req =>
        this.serviceRequirementRepository.create({
          ...req,
          serviceId: savedService.id,
        })
      );
      await this.serviceRequirementRepository.save(requirements);
    }


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


  async updateService(userId: string, serviceId: string, updateServiceDto: any, req: any) {
    const service = await this.serviceRepository.findOne({
      where: { id: serviceId },
      relations: ['seller'],
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    // If title is being updated, generate new slug and check uniqueness
    if (updateServiceDto.title && updateServiceDto.title !== service.title) {
      const newSlug = this.createSlug(updateServiceDto.title);

      const existingService = await this.serviceRepository.findOne({ where: { slug: newSlug } });
      if (existingService && existingService.id !== service.id) {
        throw new BadRequestException(
          `Service with title "${updateServiceDto.title}" already exists. Please choose a different title.`
        );
      }

      service.slug = newSlug;
    }
    const user = req?.user;

    const hasPermission = PermissionBitmaskHelper.has(user?.permissions?.services, Permissions.Services.ChangeStatus)
    if (user?.role != 'admin' || !hasPermission)
      if (service.sellerId !== userId) {
        throw new ForbiddenException('You can only update your own services');
      }


    // Explicitly assign only allowed fields
    const allowedFields = [
      'title',
      'brief',
      'metadata',
      'searchTags',
      'categoryId',
      'subcategoryId',
      'additionalRevision',
      'fastDelivery',
      'faq',
      'packages',
      'gallery',
    ];

    for (const field of allowedFields) {
      if (field in updateServiceDto) {
        service[field] = updateServiceDto[field];
      }
    }

    service.status = ServiceStatus.PENDING;
    // Update service first
    const savedService = await this.serviceRepository.save(service);

    // Update requirements if provided
    if (updateServiceDto.requirements) {
      // Delete existing requirements
      await this.serviceRequirementRepository.delete({ serviceId });

      // Create new requirements
      const requirements = updateServiceDto.requirements.map(req =>
        this.serviceRequirementRepository.create({
          ...req,
          serviceId,
        })
      );
      await this.serviceRequirementRepository.save(requirements);
    }

    return savedService;
  }

  async updateServiceStatus(serviceId: string, status: ServiceStatus) {
    const service = await this.serviceRepository.findOne({ where: { id: serviceId } });
    if (!service) throw new NotFoundException('Service not found');

    // Validate that status is a valid enum value
    if (!Object.values(ServiceStatus).includes(status)) {
      throw new BadRequestException(`Invalid status "${status}". Allowed values: ${Object.values(ServiceStatus).join(', ')}`);
    }

    service.status = status;
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

  async trackClick(serviceId: string, req, userId?: string) {
    const deviceInfo = await this.sessionService.getDeviceInfoFromRequest(req);
    const ip = deviceInfo.ip_address;

    if (!userId && !ip) {
      throw new BadRequestException('Cannot track click: missing user and IP.');
    }

    // Time window (24h)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Build search conditions
    const where: any = { serviceId, clickedAt: MoreThan(since) };

    if (userId) where.userId = userId;
    else where.ipAddress = ip;

    // Check if already clicked
    const existingClick = await this.serviceClickRepository.findOne({ where });

    if (existingClick) {
      return { message: 'Click already counted' };
    }

    // Save click entry
    await this.serviceClickRepository.save({
      serviceId,
      userId: userId || null,
      ipAddress: ip || null,
    });

    // Increment service total clicks
    await this.serviceRepository.increment({ id: serviceId }, 'clicks', 1);

    return { message: 'Click tracked' };
  }

  async markAsPopular(serviceId: string, iconUrl: string) {
    const service = await this.serviceRepository.findOne({ where: { id: serviceId } });
    if (!service) throw new NotFoundException('Service not found');

    if (service.status != ServiceStatus.ACTIVE) {
      throw new BadRequestException('Only active services can be marked as popular');
    }
    // limit max 10 popular items
    const count = await this.serviceRepository.count({ where: { popular: true } });
    if (count >= 10) {
      throw new BadRequestException('Maximum 10 popular services allowed.');
    }

    service.popular = true;
    service.iconUrl = iconUrl;

    return this.serviceRepository.save(service);
  }

  async updatePopularIcon(id: string, iconUrl: string) {
    const service = await this.serviceRepository.findOne({ where: { id } });

    if (!service) throw new NotFoundException('Service not found');

    if (!service.popular) throw new NotFoundException('Service not popular');
    // Update only the icon
    service.iconUrl = iconUrl;

    await this.serviceRepository.save(service);

    return { message: 'Popular icon updated', iconUrl };
  }


  async unmarkAsPopular(serviceId: string) {
    const service = await this.serviceRepository.findOne({ where: { id: serviceId } });
    if (!service) throw new NotFoundException('Service not found');


    if (service.iconUrl) {
      const oldPath = join(process.cwd(), service.iconUrl);
      try {
        await fsp.unlink(oldPath);
      } catch (err) {
        // File may not exist, ignore
        if ((err as any).code !== 'ENOENT') {
          console.error('Failed to delete old icon:', err);
        }
      }
    }

    service.popular = false;
    service.iconUrl = null;

    return this.serviceRepository.save(service);
  }


  async getPopularServices() {
    return this.serviceRepository.find({
      where: { popular: true, status: ServiceStatus.ACTIVE },
      relations: ['category'],
      order: { ordersCount: 'DESC' },
    });
  }
}
