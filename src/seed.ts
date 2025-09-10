// seed.ts
import { DataSource, IsNull, Not } from 'typeorm';
import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

// Import all your entities
import { User, UserRole, UserStatus, AccountDeactivation, Recommendation, PendingUserRegistration, Setting, ServiceBoost, NotificationSetting, Notification, Category, CategoryType, Service, ServiceStatus, ServiceRequirement, Job, BudgetType, JobStatus, Proposal, ProposalStatus, Order, OrderStatus, PackageType, Invoice, PaymentStatus, Payment, PaymentMethodType, TransactionStatus, Currency, Conversation, Message, ServiceReview, Cart, CartItem, Favorite, SavedSearch, AbuseReport, AbuseReportStatus, Dispute, DisputeStatus, SupportTicket, SupportTicketStatus, SupportTicketPriority, UserBalance, Transaction, PaymentMethod, Referral, ReferralStatus, Affiliate, Report, Blog, BlogStatus, BlogLike, BlogComment, CommentStatus, BlogCategory } from 'entities/global.entity';

export class Seeder {
  constructor(private dataSource: DataSource) {}

  async seed() {
    try {
      console.log('Starting database seeding...');

      // Clear existing data (optional - be careful in production!)
      // await this.clearDatabase();

      // Seed in the correct order to maintain foreign key constraints
      // await this.seedSettings();
      // await this.seedCurrencies();
      // const users = await this.seedUsers();
      // const categories = await this.seedCategories();
      // const services = await this.seedServices();
      // await this.seedUserProfiles(users);
      // await this.seedNotificationSettings(users);
      // await this.seedCoins(users);
      // await this.seedServiceBoosts(users, services);
      // await this.seedJobs(users, categories);
      // const orders = await this.seedOrders(users, services);
      // await this.seedInvoices(orders);
      // await this.seedPayments(users, orders);
      // await this.seedConversations(users, services, orders);
      // await this.seedMessages(users);
      // await this.seedServiceReviews(users, services);
      // await this.seedCarts(users);
      // await this.seedCartItems(users, services);
      // await this.seedFavorites(users, services);
      // await this.seedSavedSearches(users);
      // await this.seedAbuseReports(users, services);
      // await this.seedDisputes(users, orders);
      // await this.seedSupportTickets(users);
      // await this.seedUserBalances(users);
      // await this.seedTransactions(users, orders);
      // await this.seedPaymentMethods(users);
      // await this.seedReferrals(users);
      // await this.seedAffiliates(users);
      // await this.seedReports(users);
      // const blogs = await this.seedBlogs(users);
      // await this.seedBlogCategories();
      // await this.seedBlogLikes(users, blogs);
      // await this.seedBlogComments(users, blogs);

      const categories = await this.seedCategories();
      const users = await this.seedUsers();
      await this.seedServices();

      console.log('Database seeding completed successfully!');
    } catch (error) {
      console.error('Error seeding database:', error);
      throw error;
    }
  }

  // Clear all data from database (use with caution!)
  async clearDatabase() {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // Clear tables in the correct order (child tables first)
      const clearOrder = [
        // Add all your table names in reverse dependency order
        'payments',
        'invoices',
        'messages',
        'conversations',
        'service_reviews',
        'cart_items',
        'favorites',
        'saved_searches',
        'abuse_reports',
        'disputes',
        'support_tickets',
        'transactions',
        'payment_methods',
        'referrals',
        'affiliates',
        'reports',
        'service_requirements',
        'service_boosts',
        'proposals',
        'orders',
        'jobs',
        'services',
        'assets',
        'notifications',
        'notification_settings',
        'user_profiles',
        'coins',
        'recommendations',
        'account_deactivations',
        'pending_user_registrations',
        'blog_likes',
        'blog_comments',
        'categories',
        'users',
        'currencies',
        'settings',
        'blogs',
        'blog_categories',
      ];

      for (const table of clearOrder) {
        try {
          await queryRunner.query(`DELETE FROM "${table}"`);
          console.log(`Cleared table: ${table}`);
        } catch (error) {
          console.warn(`Could not clear table ${table}:`, error.message);
        }
      }

      await queryRunner.commitTransaction();
      console.log('Database cleared successfully!');
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error clearing database:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async seedSettings(): Promise<void> {
    const settingRepository = this.dataSource.getRepository(Setting);

    const setting = settingRepository.create({
      siteName: faker.company.name(),
      siteLogo: faker.image.url(),
      privacyPolicy: faker.lorem.paragraphs(5),
      termsOfService: faker.lorem.paragraphs(7),
      contactEmail: faker.internet.email(),
      supportPhone: faker.phone.number(),
      platformPercent: faker.number.float({ min: 5, max: 20, precision: 0.01 } as any as any),
      defaultCurrency: faker.number.int({ min: 1, max: 3 }),
      popularServices: Array.from({ length: 5 }, () => faker.number.int({ min: 1, max: 50 })),
      clientsExperiences: Array.from({ length: 5 }, () => faker.number.int({ min: 1, max: 50 })),
      featuredCategories: Array.from({ length: 5 }, () => faker.number.int({ min: 1, max: 10 })),
      recommendedServices: Array.from({ length: 5 }, () => faker.number.int({ min: 1, max: 50 })),
      businessRecommendations: Array.from({ length: 5 }, () => faker.number.int({ min: 1, max: 50 })),
      faqs: Array.from({ length: 5 }, () => faker.number.int({ min: 1, max: 20 })),
      buyerStories: Array.from({ length: 5 }, () => faker.number.int({ min: 1, max: 10 })),
      affiliatesEnabled: faker.datatype.boolean(),
    });

    await settingRepository.save(setting);
    console.log('Settings seeded');
  }

  async seedCurrencies(): Promise<void> {
    const currencyRepository = this.dataSource.getRepository(Currency);

    const currencies = [
      { code: 'USD', name: 'US Dollar', symbol: '$', exchangeRate: 1.0 },
      { code: 'EUR', name: 'Euro', symbol: '€', exchangeRate: 0.85 },
      { code: 'GBP', name: 'British Pound', symbol: '£', exchangeRate: 0.75 },
      { code: 'JPY', name: 'Japanese Yen', symbol: '¥', exchangeRate: 110.0 },
    ];

    for (const currencyData of currencies) {
      const currency = currencyRepository.create(currencyData);
      await currencyRepository.save(currency);
    }

    console.log('Currencies seeded');
  }

  private generateUniqueSlug(name: string, usedSlugs: Set<string>): string {
    let baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

    let slug = baseSlug;
    let counter = 1;

    // Ensure the slug is unique
    while (usedSlugs.has(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  private async seedCategories(): Promise<Category[]> {
    console.log('Creating categories...');
    const categoryRepository = this.dataSource.getRepository(Category);

    // Check if categories already exist (including soft-deleted)
    const existingCategories = await categoryRepository.find({ withDeleted: true });

    if (existingCategories.length > 0) {
      // Restore soft-deleted categories with proper criteria
      await categoryRepository.restore({ id: Not(IsNull()) });
      return existingCategories;
    }

    const categoriesData = [
      {
        type: 'category',
        name: 'Programming & Tech',
        slug: 'programming-tech',
        description: 'Software development, programming, and technical services',
        image: faker.image.url(),
      },
      {
        type: 'category',
        name: 'Design & Creative',
        slug: 'design-creative',
        description: 'Graphic design, video editing, and creative services',
        image: faker.image.url(),
      },
      {
        type: 'subcategory',
        name: 'Web Development',
        slug: 'web-development',
        description: 'Website and web application development services',
        image: faker.image.url(),
      },
      {
        type: 'subcategory',
        name: 'Mobile App Development',
        slug: 'mobile-app-development',
        description: 'iOS and Android app development services',
        image: faker.image.url(),
      },
      {
        type: 'subcategory',
        name: 'Logo Design',
        slug: 'logo-design',
        description: 'Professional logo design services',
        image: faker.image.url(),
      },
    ];

    const categories = [];
    for (const categoryData of categoriesData) {
      const category = categoryRepository.create(categoryData as any);
      categories.push(await categoryRepository.save(category));
    }

    console.log(`Created ${categories.length} categories`);
    return categories;
  }

  private async seedUsers(): Promise<User[]> {
    const userRepository = this.dataSource.getRepository(User);
    const users: User[] = [];

    const countries = ['US', 'UK', 'CA', 'AU', 'DE', 'FR', 'IN', 'BR', 'NG', 'ZA', 'EG', 'SA', 'AE'];
    const langPool = ['English', 'Arabic', 'French', 'Spanish', 'German', 'Chinese', 'Japanese'];
    const skillPool = ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Java', 'Graphic Design', 'UI/UX Design', 'Logo Design', 'WordPress', 'SEO', 'Social Media Marketing', 'Content Writing', 'Video Editing'];
    const sellerLevels = ['lvl1', 'lvl2', 'top']; // keep aligned with your entity defaults

    const makeDevice = () => ({
      device_type: faker.helpers.arrayElement(['Desktop', 'Mobile', 'Tablet']),
      browser: faker.helpers.arrayElement(['Chrome', 'Firefox', 'Safari', 'Edge']),
      ip_address: faker.internet.ip(),
      os: faker.helpers.arrayElement(['Windows', 'macOS', 'Linux', 'iOS', 'Android']),
      last_activity: faker.date.recent(),
    });

    const makeEducation = () => ({
      degree: faker.helpers.arrayElement(['Bachelor', 'Master', 'PhD']),
      institution: faker.company.name(),
      year: faker.number.int({ min: 1990, max: 2024 }),
    });

    const makeCertification = () => ({
      name: faker.helpers.arrayElement(['AWS Certified', 'Google Analytics', 'Adobe Certified', 'Content Marketing']),
      issuingOrganization: faker.company.name(),
      year: faker.number.int({ min: 2015, max: 2025 }),
    });

    const makePortfolioItem = () => ({
      title: faker.commerce.productName(),
      description: faker.lorem.sentence(),
      image: faker.image.url(),
      url: faker.internet.url(),
    });

    // ---------- Admin
    const adminUser = userRepository.create({
      username: 'admin',
      email: 'admin@example.com',
      password: 'password123', // hashed by entity hook
      type: faker.helpers.arrayElement(['Business', 'Individual']),
      phone: faker.phone.number(),
      profileImage: faker.image.avatar(),
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      lastLogin: faker.date.recent(),
      lastActivity: faker.date.recent(),
      devices: [makeDevice()],
      memberSince: faker.date.past({ years: 2 }),
      description: faker.person.bio(),
      languages: [faker.helpers.arrayElement(langPool)],
      country: faker.helpers.arrayElement(countries),
      skills: Array.from({ length: faker.number.int({ min: 3, max: 8 }) }, () => faker.helpers.arrayElement(skillPool)),
      education: Array.from({ length: faker.number.int({ min: 1, max: 2 }) }, makeEducation),
      certifications: Array.from({ length: faker.number.int({ min: 0, max: 3 }) }, makeCertification),
      introVideoUrl: faker.datatype.boolean() ? faker.internet.url() : null,
      portfolioItems: Array.from({ length: faker.number.int({ min: 0, max: 3 }) }, () => ({ url: faker.internet.url() })),
      portfolioFile: faker.datatype.boolean() ? `/uploads/portfolio-${faker.string.uuid()}.pdf` : null,
      // merged fields
      responseTime: faker.number.float({ min: 0.5, max: 48, multipleOf: 0.5 }),
      deliveryTime: `${faker.number.int({ min: 1, max: 14 })} days`,
      ageGroup: faker.helpers.arrayElement(['18-24', '25-34', '35-44', '45-54', '55+']),
      revisions: faker.number.int({ min: 0, max: 5 }),
      sellerLevel: 'lvl1',
      preferences: { newsletter: faker.datatype.boolean(), theme: faker.helpers.arrayElement(['light', 'dark']) },
      balance: faker.number.float({ min: 0, max: 5000, multipleOf: 0.01 }),
      totalSpent: faker.number.float({ min: 0, max: 10000, multipleOf: 0.01 }),
      totalEarned: faker.number.float({ min: 0, max: 20000, multipleOf: 0.01 }),
      reputationPoints: faker.number.int({ min: 0, max: 1000 }),
      referralCode: faker.string.alphanumeric(8).toUpperCase(),
      referralCount: faker.number.int({ min: 0, max: 10 }),
      referralRewardsCount: faker.number.int({ min: 0, max: 5 }),
      // stats-like fields in the merged model (optional to seed)
      ordersCompleted: faker.number.int({ min: 0, max: 200 }),
      repeatBuyers: faker.number.int({ min: 0, max: 50 }),
      topRated: faker.datatype.boolean(),
    } as Partial<User> as any);

    // ---------- Seller (example)
    const sellerUser = userRepository.create({
      username: 'ahmed abdelrhman',
      email: 'ahmedabdelrhman083@gmail.com',
      password: 'ahmedabdelrhman083@gmail.com',
      type: faker.helpers.arrayElement(['Business', 'Individual']),
      phone: faker.phone.number(),
      profileImage: faker.image.avatar(),
      role: UserRole.SELLER,
      status: faker.helpers.arrayElement([UserStatus.ACTIVE, UserStatus.PENDING_VERIFICATION]),
      lastLogin: faker.date.recent(),
      lastActivity: faker.date.recent(),
      devices: [makeDevice()],
      memberSince: faker.date.past({ years: 2 }),
      description: faker.person.bio(),
      languages: [faker.helpers.arrayElement(['English', 'Arabic', 'French'])],
      country: 'EG',
      skills: Array.from({ length: faker.number.int({ min: 3, max: 8 }) }, () => faker.helpers.arrayElement(skillPool)),
      education: Array.from({ length: faker.number.int({ min: 1, max: 2 }) }, makeEducation),
      certifications: Array.from({ length: faker.number.int({ min: 0, max: 3 }) }, makeCertification),
      introVideoUrl: faker.datatype.boolean() ? faker.internet.url() : null,
      portfolioItems: Array.from({ length: faker.number.int({ min: 0, max: 4 }) }, () => ({ url: faker.internet.url() })),
      portfolioFile: faker.datatype.boolean() ? `/uploads/portfolio-${faker.string.uuid()}.pdf` : null,
      // merged fields
      responseTime: faker.number.float({ min: 0.5, max: 48, multipleOf: 0.5 }),
      deliveryTime: `${faker.number.int({ min: 1, max: 14 })} days`,
      ageGroup: faker.helpers.arrayElement(['18-24', '25-34', '35-44', '45-54', '55+']),
      revisions: faker.number.int({ min: 0, max: 5 }),
      sellerLevel: faker.helpers.arrayElement(sellerLevels),
      preferences: { notifications: { email: true, push: faker.datatype.boolean() } },
      balance: faker.number.float({ min: 0, max: 2000, multipleOf: 0.01 }),
      totalSpent: faker.number.float({ min: 0, max: 5000, multipleOf: 0.01 }),
      totalEarned: faker.number.float({ min: 0, max: 15000, multipleOf: 0.01 }),
      reputationPoints: faker.number.int({ min: 0, max: 1000 }),
      referralCode: faker.string.alphanumeric(8).toUpperCase(),
      referralCount: faker.number.int({ min: 0, max: 10 }),
      referralRewardsCount: faker.number.int({ min: 0, max: 5 }),
      ordersCompleted: faker.number.int({ min: 0, max: 300 }),
      repeatBuyers: faker.number.int({ min: 0, max: 80 }),
      topRated: faker.datatype.boolean(),
    } as Partial<User> as any);

    // ---------- Buyer
    const buyerUser = userRepository.create({
      username: 'shtya',
      email: 'shtya54@gmail.com',
      password: 'shtya54@gmail.com',
      type: faker.helpers.arrayElement(['Business', 'Individual']),
      phone: faker.phone.number(),
      profileImage: faker.image.avatar(),
      role: UserRole.BUYER,
      status: UserStatus.ACTIVE,
      lastLogin: faker.date.recent(),
      lastActivity: faker.date.recent(),
      devices: [makeDevice()],
      memberSince: faker.date.past({ years: 2 }),
      description: faker.person.bio(),
      languages: [faker.helpers.arrayElement(['English', 'Arabic'])],
      country: 'SA',
      skills: Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => faker.helpers.arrayElement(skillPool)),
      education: Array.from({ length: faker.number.int({ min: 0, max: 2 }) }, makeEducation),
      certifications: Array.from({ length: faker.number.int({ min: 0, max: 2 }) }, makeCertification),
      introVideoUrl: faker.datatype.boolean() ? faker.internet.url() : null,
      portfolioItems: Array.from({ length: faker.number.int({ min: 0, max: 3 }) }, () => ({ url: faker.internet.url() })),
      portfolioFile: faker.datatype.boolean() ? `/uploads/portfolio-${faker.string.uuid()}.pdf` : null,
      // merged fields
      responseTime: null,
      deliveryTime: null,
      ageGroup: faker.helpers.arrayElement(['18-24', '25-34', '35-44', '45-54', '55+']),
      revisions: 0,
      sellerLevel: null, // buyers don’t need seller level
      preferences: { marketingEmails: faker.datatype.boolean() },
      balance: faker.number.float({ min: 0, max: 3000, multipleOf: 0.01 }),
      totalSpent: faker.number.float({ min: 0, max: 8000, multipleOf: 0.01 }),
      totalEarned: 0,
      reputationPoints: faker.number.int({ min: 0, max: 500 }),
      referralCode: faker.string.alphanumeric(8).toUpperCase(),
      referredById: users.length > 0 && faker.datatype.boolean() ? users[faker.number.int({ min: 0, max: users.length - 1 })].id : null,
      referralCount: faker.number.int({ min: 0, max: 5 }),
      referralRewardsCount: faker.number.int({ min: 0, max: 3 }),
      ordersCompleted: 0,
      repeatBuyers: 0,
      topRated: false,
    } as Partial<User> as any);

    users.push(await userRepository.save(adminUser as any));
    users.push(await userRepository.save(sellerUser as any));
    users.push(await userRepository.save(buyerUser as any));

    // ---------- Bulk users
    for (let i = 0; i < 20; i++) {
      const isSeller = i > 5;
      const u = userRepository.create({
        username: faker.internet.username(),
        email: faker.internet.email(),
        password: 'password123',
        type: faker.helpers.arrayElement(['Business', 'Individual']),
        phone: faker.phone.number(),
        profileImage: faker.image.avatar(),
        role: isSeller ? UserRole.SELLER : UserRole.BUYER,
        status: UserStatus.ACTIVE,
        lastLogin: faker.date.recent(),
        lastActivity: faker.date.recent(),
        devices: [makeDevice()],
        memberSince: faker.date.past({ years: 2 }),
        referralCode: faker.string.alphanumeric(8).toUpperCase(),
        description: faker.person.bio(),
        languages: Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () => faker.helpers.arrayElement(langPool)),
        country: faker.helpers.arrayElement(countries),
        skills: Array.from({ length: faker.number.int({ min: 3, max: 8 }) }, () => faker.helpers.arrayElement(skillPool)),
        education: Array.from({ length: faker.number.int({ min: 1, max: 2 }) }, makeEducation),
        certifications: Array.from({ length: faker.number.int({ min: 0, max: 3 }) }, makeCertification),
        introVideoUrl: faker.helpers.maybe(() => faker.internet.url(), { probability: 0.3 }),
        portfolioItems: Array.from({ length: faker.number.int({ min: 0, max: 5 }) }, makePortfolioItem).map(p => ({ url: p.url })),
        portfolioFile: faker.helpers.maybe(() => `/uploads/portfolio-${faker.string.uuid()}.pdf`, { probability: 0.25 }),
        // merged fields
        responseTime: isSeller ? faker.number.float({ min: 0.5, max: 48, multipleOf: 0.5 }) : null,
        deliveryTime: isSeller ? `${faker.number.int({ min: 1, max: 14 })} days` : null,
        ageGroup: faker.helpers.arrayElement(['18-24', '25-34', '35-44', '45-54', '55+']),
        revisions: isSeller ? faker.number.int({ min: 0, max: 5 }) : 0,
        sellerLevel: isSeller ? faker.helpers.arrayElement(sellerLevels) : null,
        preferences: { locale: faker.helpers.arrayElement(['en', 'ar', 'fr']), currency: faker.helpers.arrayElement(['USD', 'EUR', 'EGP', 'SAR']) },
        balance: faker.number.float({ min: 0, max: 5000, multipleOf: 0.01 }),
        totalSpent: faker.number.float({ min: 0, max: 12000, multipleOf: 0.01 }),
        totalEarned: isSeller ? faker.number.float({ min: 0, max: 25000, multipleOf: 0.01 }) : 0,
        reputationPoints: faker.number.int({ min: 0, max: 1000 }),
        referralCount: faker.number.int({ min: 0, max: 10 }),
        referralRewardsCount: faker.number.int({ min: 0, max: 5 }),
        ordersCompleted: isSeller ? faker.number.int({ min: 0, max: 300 }) : 0,
        repeatBuyers: isSeller ? faker.number.int({ min: 0, max: 80 }) : 0,
        topRated: isSeller ? faker.datatype.boolean() : false,
      } as Partial<User> as any);

      users.push(await userRepository.save(u as any));
    }

    // If you still want to return sellers only:
    return users.filter(u => u.role === UserRole.SELLER);
  }

  private async seedServices(): Promise<void> {
    const userRepository = this.dataSource.getRepository(User);
    const categoryRepository = this.dataSource.getRepository(Category);
    const serviceRepository = this.dataSource.getRepository(Service);

    const allCategories = await categoryRepository.find();
    const sellers = await userRepository.find();

    const mainCategories = allCategories.filter(c => c.type === 'category');
    const subCategories = allCategories.filter(c => c.type === 'subcategory');

    for (const seller of sellers) {
      // Each seller has 2-5 services
      const serviceCount = faker.number.int({ min: 2, max: 5 });

      for (let i = 0; i < serviceCount; i++) {
        const category = faker.helpers.arrayElement(mainCategories);
        const subcategory = faker.helpers.arrayElement(subCategories);
        const serviceData = {
          sellerId: seller.id,
          title: faker.commerce.productName() + ' Service',
          brief: faker.lorem.paragraph(),
          metadata: {},
          searchTags: Array.from({ length: faker.number.int({ min: 3, max: 8 }) }, () => faker.commerce.productAdjective()),
          categoryId: category.id,
          subcategoryId: subcategory.id,
          status: ServiceStatus.ACTIVE,
          impressions: faker.number.int({ min: 100, max: 5000 }),
          clicks: faker.number.int({ min: 10, max: 500 }),
          ordersCount: faker.number.int({ min: 0, max: 100 }),
          cancellations: faker.number.int({ min: 0, max: 5 }),
          performanceScore: faker.number.float({ min: 3, max: 5, fractionDigits: 2 }),
          fastDelivery: faker.datatype.boolean(),
          additionalRevision: faker.datatype.boolean(),
          rating: faker.number.float({ min: 3, max: 5, fractionDigits: 1 }),
          faq: Array.from({ length: faker.number.int({ min: 2, max: 5 }) }, () => ({
            question: faker.lorem.sentence().replace('.', '?'),
            answer: faker.lorem.paragraph(),
          })),
          packages: [
            {
              name: 'Basic',
              price: faker.number.float({ min: 20, max: 100, fractionDigits: 2 }),
              features: Array.from({ length: faker.number.int({ min: 3, max: 5 }) }, () => faker.lorem.sentence()),
              description: faker.lorem.sentence(),
              deliveryTime: faker.number.int({ min: 1, max: 3 }),
              revisions: faker.number.int({ min: 1, max: 2 }),
              test: true,
            },
            {
              name: 'Standard',
              price: faker.number.float({ min: 100, max: 300, fractionDigits: 2 }),
              features: Array.from({ length: faker.number.int({ min: 5, max: 8 }) }, () => faker.lorem.sentence()),
              description: faker.lorem.sentence(),
              deliveryTime: faker.number.int({ min: 3, max: 7 }),
              revisions: faker.number.int({ min: 2, max: 3 }),
              test: false,
            },
            {
              name: 'Premium',
              price: faker.number.float({ min: 300, max: 1000, fractionDigits: 2 }),
              features: Array.from({ length: faker.number.int({ min: 8, max: 12 }) }, () => faker.lorem.sentence()),
              description: faker.lorem.sentence(),
              deliveryTime: faker.number.int({ min: 7, max: 14 }),
              revisions: faker.number.int({ min: 3, max: 5 }),
              test: true,
            },
          ],
          gallery: Array.from({ length: 7 }, () => ({
            url: faker.image.url(),
            fileName: faker.lorem.sentence(),
            type: 'image/',
          })),
        };

        const service = serviceRepository.create(serviceData);
        await serviceRepository.save(service);
      }
    }
  }

  async seedNotificationSettings(users: User[]): Promise<void> {
    const notificationSettingRepository = this.dataSource.getRepository(NotificationSetting);

    for (const user of users) {
      const setting = notificationSettingRepository.create({
        userId: user.id,
        settings: {
          email: {
            orders: faker.datatype.boolean(),
            messages: faker.datatype.boolean(),
            promotions: faker.datatype.boolean(),
            recommendations: faker.datatype.boolean(),
          },
          push: {
            orders: faker.datatype.boolean(),
            messages: faker.datatype.boolean(),
            reminders: faker.datatype.boolean(),
          },
          inApp: {
            all: faker.datatype.boolean(),
          },
        },
      });

      await notificationSettingRepository.save(setting);
    }

    console.log('Notification settings seeded');
  }

  async seedServiceBoosts(users: User[], services: Service[]): Promise<void> {
    const serviceBoostRepository = this.dataSource.getRepository(ServiceBoost);

    const sellerUsers = users.filter(user => user.role === UserRole.SELLER);

    for (const seller of sellerUsers) {
      const sellerServices = services.filter(service => service.sellerId === seller.id);

      if (sellerServices.length > 0) {
        const serviceToBoost = faker.helpers.arrayElement(sellerServices);

        const boost = serviceBoostRepository.create({
          serviceId: serviceToBoost.id,
          userId: seller.id,
          usedCoins: faker.number.int({ min: 10, max: 100 }),
          startDate: faker.date.recent({ days: 10 }),
          endDate: faker.date.soon({ days: 20 }),
          status: faker.helpers.arrayElement(['active', 'expired']),
        });

        await serviceBoostRepository.save(boost);
      }
    }

    console.log('Service boosts seeded');
  }

  async seedJobs(users: User[], categories: Category[]): Promise<void> {
    const jobRepository = this.dataSource.getRepository(Job);
    const buyerUsers = users.filter(user => user.role === UserRole.BUYER);
    const mainCategories = categories.filter(c => c.type === CategoryType.CATEGORY);
    const subCategories = categories.filter(c => c.type === CategoryType.SUBCATEGORY);

    for (const buyer of buyerUsers) {
      const jobCount = faker.number.int({ min: 0, max: 3 });

      for (let i = 0; i < jobCount; i++) {
        const category = faker.helpers.arrayElement(mainCategories);
        const subcategory = faker.helpers.arrayElement(subCategories);

        const job = jobRepository.create({
          buyerId: buyer.id,
          title: faker.person.jobTitle(),
          description: faker.lorem.paragraphs(3),
          categoryId: category.id,
          subcategoryId: subcategory.id,
          budget: faker.number.float({ min: 50, max: 5000, precision: 0.01 } as any),
          budgetType: faker.helpers.arrayElement([BudgetType.FIXED, BudgetType.HOURLY]),
          status: faker.helpers.arrayElement([JobStatus.DRAFT, JobStatus.PUBLISHED, JobStatus.CLOSED, JobStatus.AWARDED, JobStatus.COMPLETED]),
          preferredDeliveryDays: faker.number.int({ min: 1, max: 30 }),
          skillsRequired: Array.from({ length: faker.number.int({ min: 3, max: 8 }) }, () => faker.helpers.arrayElement(['JavaScript', 'TypeScript', 'React', 'Node.js', 'Graphic Design', 'Content Writing', 'SEO', 'Marketing'])),
          attachments: Array.from({ length: faker.number.int({ min: 0, max: 3 }) }, () => ({
            name: faker.system.fileName(),
            url: faker.internet.url(),
            type: faker.helpers.arrayElement(['pdf', 'doc', 'jpg', 'png']),
            uploadedAt: faker.date.recent(),
          })),
          additionalInfo: faker.lorem.paragraph(),
          closedAt: faker.datatype.boolean() ? faker.date.recent() : null,
        });

        await jobRepository.save(job);
      }
    }

    console.log('Jobs seeded');
  }

  async seedOrders(users: User[], services: Service[]): Promise<Order[]> {
    const orderRepository = this.dataSource.getRepository(Order);
    const orders: Order[] = [];
    const buyerUsers = users.filter(user => user.role === UserRole.BUYER);

    for (const service of services) {
      // Only create orders for active services
      if (service.status !== ServiceStatus.ACTIVE) continue;

      const orderCount = faker.number.int({ min: 0, max: 5 });

      for (let i = 0; i < orderCount; i++) {
        const buyer = faker.helpers.arrayElement(buyerUsers);
        const packageType = faker.helpers.arrayElement([PackageType.BASIC, PackageType.STANDARD, PackageType.PREMIUM]);

        // Find the selected package to get the price
        const selectedPackage = service.packages.find(pkg => pkg.type === packageType);
        const price = selectedPackage ? selectedPackage.price : faker.number.float({ min: 10, max: 500, precision: 0.01 } as any);

        const order = orderRepository.create({
          buyerId: buyer.id,
          sellerId: service.sellerId,
          serviceId: service.id,
          title: service.title,
          quantity: faker.number.int({ min: 1, max: 3 }),
          totalAmount: price,
          packageType: packageType,
          status: faker.helpers.arrayElement([OrderStatus.PENDING, OrderStatus.ACCEPTED, OrderStatus.DELIVERED, OrderStatus.COMPLETED, OrderStatus.CANCELLED]),
          requirementsAnswers: Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () => ({
            question: faker.lorem.sentence(),
            answer: faker.lorem.sentence(),
          })),
          timeline: [
            {
              status: 'ordered',
              date: faker.date.recent({ days: 10 }),
            },
            ...(faker.datatype.boolean()
              ? [
                  {
                    status: 'in_progress',
                    date: faker.date.recent({ days: 5 }),
                  },
                ]
              : []),
            ...(faker.datatype.boolean()
              ? [
                  {
                    status: 'delivered',
                    date: faker.date.recent({ days: 2 }),
                  },
                ]
              : []),
          ],
          orderDate: faker.date.recent({ days: 10 }),
          dueDate: faker.date.soon({ days: 7 }),
          deliveredAt: faker.datatype.boolean() ? faker.date.recent({ days: 2 }) : null,
          completedAt: faker.datatype.boolean() ? faker.date.recent({ days: 1 }) : null,
          cancelledAt: faker.datatype.boolean({ probability: 0.1 }) ? faker.date.recent() : null,
        });

        orders.push(await orderRepository.save(order));
      }
    }

    console.log('Orders seeded');
    return orders;
  }

  async seedInvoices(orders: Order[]): Promise<void> {
    const invoiceRepository = this.dataSource.getRepository(Invoice);

    for (const order of orders) {
      const platformPercent = faker.number.float({ min: 5, max: 20, precision: 0.01 } as any);
      const subtotal = order.totalAmount;
      const serviceFee = subtotal * (platformPercent / 100);
      const totalAmount = subtotal + serviceFee;

      const invoice = invoiceRepository.create({
        invoiceNumber: `INV-${faker.string.alphanumeric(8).toUpperCase()}`,
        orderId: order.id,
        subtotal: subtotal,
        serviceFee: serviceFee,
        platformPercent: platformPercent,
        totalAmount: totalAmount,
        currencyId: '1', // Assuming USD
        issuedAt: order.orderDate,
        paymentStatus: faker.helpers.arrayElement([PaymentStatus.PENDING, PaymentStatus.PAID, PaymentStatus.FAILED]),
        paymentMethod: faker.helpers.arrayElement(['credit_card', 'paypal', 'bank_transfer']),
        transactionId: faker.datatype.boolean() ? `TXN-${faker.string.alphanumeric(10).toUpperCase()}` : null,
      });

      await invoiceRepository.save(invoice);
    }

    console.log('Invoices seeded');
  }

  async seedPayments(users: User[], orders: Order[]): Promise<void> {
    const paymentRepository = this.dataSource.getRepository(Payment);
    const invoiceRepository = this.dataSource.getRepository(Invoice);

    // Get all invoices
    const invoices = await invoiceRepository.find();

    for (const order of orders) {
      const buyer = users.find(user => user.id === order.buyerId);
      if (!buyer) continue;

      // Find the invoice for this order
      const invoice = invoices.find(inv => inv.orderId === order.id);
      if (!invoice) continue; // Skip if no invoice found for this order

      const payment = paymentRepository.create({
        invoiceId: invoice.id, // Use the actual invoice ID, not order ID
        userId: buyer.id,
        amount: order.totalAmount,
        currencyId: '1', // Assuming USD
        method: faker.helpers.arrayElement([PaymentMethodType.CARD, PaymentMethodType.WALLET, PaymentMethodType.BANK]),
        status: faker.helpers.arrayElement([TransactionStatus.PENDING, TransactionStatus.COMPLETED, TransactionStatus.FAILED, TransactionStatus.REFUNDED]),
        transactionId: `TXN-${faker.string.alphanumeric(10).toUpperCase()}`,
        paidAt: faker.datatype.boolean() ? faker.date.recent() : null,
      });

      await paymentRepository.save(payment);
    }

    console.log('Payments seeded');
  }

  async seedConversations(users: User[], services: Service[], orders: Order[]): Promise<void> {
    const conversationRepository = this.dataSource.getRepository(Conversation);
    const buyerUsers = users.filter(user => user.role === UserRole.BUYER);
    const sellerUsers = users.filter(user => user.role === UserRole.SELLER);

    // Create conversations between buyers and sellers
    for (let i = 0; i < 20; i++) {
      const buyer = faker.helpers.arrayElement(buyerUsers);
      const seller = faker.helpers.arrayElement(sellerUsers);

      // Get seller's services
      const sellerServices = services.filter(s => s.sellerId === seller.id);
      let service = null;
      if (sellerServices.length > 0) {
        service = faker.helpers.arrayElement(sellerServices);
      }

      // Get orders between this buyer and seller
      const buyerSellerOrders = orders.filter(o => o.buyerId === buyer.id && o.sellerId === seller.id);
      let order = null;
      if (buyerSellerOrders.length > 0) {
        order = faker.helpers.arrayElement(buyerSellerOrders);
      }

      const conversation = conversationRepository.create({
        buyerId: buyer.id,
        sellerId: seller.id,
        serviceId: service?.id || null,
        orderId: order?.id || null,
        lastMessageAt: faker.date.recent(),
      });

      await conversationRepository.save(conversation);
    }

    console.log('Conversations seeded');
  }

  async seedMessages(users: User[]): Promise<void> {
    const messageRepository = this.dataSource.getRepository(Message);
    const conversationRepository = this.dataSource.getRepository(Conversation);

    const conversations = await conversationRepository.find();

    for (const conversation of conversations) {
      const messageCount = faker.number.int({ min: 3, max: 15 });

      for (let i = 0; i < messageCount; i++) {
        // Alternate between buyer and seller
        const senderId = i % 2 === 0 ? conversation.buyerId : conversation.sellerId;
        const sender = users.find(user => user.id === senderId);

        if (!sender) continue;

        const message = messageRepository.create({
          conversationId: conversation.id,
          senderId: sender.id,
          message: faker.lorem.paragraph(),
          readAt: faker.datatype.boolean({ probability: 0.7 }) ? faker.date.recent() : null,
        });

        await messageRepository.save(message);
      }
    }

    console.log('Messages seeded');
  }

  async seedServiceReviews(users: User[], services: Service[]): Promise<void> {
    const serviceReviewRepository = this.dataSource.getRepository(ServiceReview);
    const buyerUsers = users.filter(user => user.role === UserRole.BUYER);

    for (const service of services) {
      // Only create reviews for services that have orders
      const reviewCount = faker.number.int({ min: 0, max: 5 });

      for (let i = 0; i < reviewCount; i++) {
        const buyer = faker.helpers.arrayElement(buyerUsers);

        const review = serviceReviewRepository.create({
          serviceId: service.id,
          reviewerId: buyer.id,
          sellerId: service.sellerId,
          rating: faker.number.int({ min: 1, max: 5 }),
          comment: faker.lorem.paragraph(),
          sellerResponse: faker.datatype.boolean({ probability: 0.3 }) ? faker.lorem.paragraph() : null,
        });

        await serviceReviewRepository.save(review);
      }
    }

    console.log('Service reviews seeded');
  }

  async seedCarts(users: User[]): Promise<void> {
    const cartRepository = this.dataSource.getRepository(Cart);

    for (const user of users) {
      // Only buyers have carts
      if (user.role !== UserRole.BUYER) continue;

      const cart = cartRepository.create({
        userId: user.id,
      });

      await cartRepository.save(cart);
    }

    console.log('Carts seeded');
  }

  async seedCartItems(users: User[], services: Service[]): Promise<void> {
    const cartItemRepository = this.dataSource.getRepository(CartItem);
    const cartRepository = this.dataSource.getRepository(Cart);

    const buyerUsers = users.filter(user => user.role === UserRole.BUYER);

    for (const buyer of buyerUsers) {
      const cart = await cartRepository.findOne({ where: { userId: buyer.id } });
      if (!cart) continue;

      const itemCount = faker.number.int({ min: 0, max: 3 });

      for (let i = 0; i < itemCount; i++) {
        const service = faker.helpers.arrayElement(services);
        const packageType = faker.helpers.arrayElement([PackageType.BASIC, PackageType.STANDARD, PackageType.PREMIUM]);

        // Find the selected package to get the price
        const selectedPackage = service.packages.find(pkg => pkg.type === packageType);
        const price = selectedPackage ? selectedPackage.price : faker.number.float({ min: 10, max: 500, precision: 0.01 } as any);

        const cartItem = cartItemRepository.create({
          cartId: cart.id,
          serviceId: service.id,
          packageType: packageType,
          quantity: faker.number.int({ min: 1, max: 2 }),
          priceSnapshot: price,
          extraServices: Array.from({ length: faker.number.int({ min: 0, max: 2 }) }, () => ({
            name: faker.commerce.productName(),
            price: faker.number.float({ min: 5, max: 50, precision: 0.01 } as any),
          })),
        });

        await cartItemRepository.save(cartItem);
      }
    }

    console.log('Cart items seeded');
  }

  async seedFavorites(users: User[], services: Service[]): Promise<void> {
    const favoriteRepository = this.dataSource.getRepository(Favorite);
    const buyerUsers = users.filter(user => user.role === UserRole.BUYER);

    for (const buyer of buyerUsers) {
      const favoriteCount = faker.number.int({ min: 0, max: 5 });

      for (let i = 0; i < favoriteCount; i++) {
        const service = faker.helpers.arrayElement(services);

        const favorite = favoriteRepository.create({
          userId: buyer.id,
          serviceId: service.id,
        });

        await favoriteRepository.save(favorite);
      }
    }

    console.log('Favorites seeded');
  }

  async seedSavedSearches(users: User[]): Promise<void> {
    const savedSearchRepository = this.dataSource.getRepository(SavedSearch);
    const buyerUsers = users.filter(user => user.role === UserRole.BUYER);

    for (const buyer of buyerUsers) {
      const searchCount = faker.number.int({ min: 0, max: 3 });

      for (let i = 0; i < searchCount; i++) {
        const savedSearch = savedSearchRepository.create({
          userId: buyer.id,
          query: faker.commerce.productName(),
          filters: {
            category: faker.helpers.arrayElement(['Web Development', 'Graphic Design', 'Content Writing']),
            priceMin: faker.number.float({ min: 10, max: 100 }),
            priceMax: faker.number.float({ min: 100, max: 1000 }),
            deliveryTime: faker.number.int({ min: 1, max: 14 }),
          },
          notify: faker.datatype.boolean(),
        });

        await savedSearchRepository.save(savedSearch);
      }
    }

    console.log('Saved searches seeded');
  }

  async seedAbuseReports(users: User[], services: Service[]): Promise<void> {
    const abuseReportRepository = this.dataSource.getRepository(AbuseReport);

    for (let i = 0; i < 5; i++) {
      const reporter = faker.helpers.arrayElement(users);
      let reportedUser = null;
      let reportedService = null;

      // Decide whether to report a user or a service
      if (faker.datatype.boolean()) {
        reportedUser = faker.helpers.arrayElement(users.filter(user => user.id !== reporter.id));
      } else {
        reportedService = faker.helpers.arrayElement(services);
        reportedUser = users.find(user => user.id === reportedService.sellerId);
      }

      if (!reportedUser) continue;

      const abuseReport = abuseReportRepository.create({
        reporterId: reporter.id,
        reportedUserId: reportedUser.id,
        reportedServiceId: reportedService?.id || null,
        reason: faker.lorem.paragraph(),
        status: faker.helpers.arrayElement([AbuseReportStatus.PENDING, AbuseReportStatus.REVIEWED, AbuseReportStatus.DISMISSED, AbuseReportStatus.ACTION_TAKEN]),
      });

      await abuseReportRepository.save(abuseReport);
    }

    console.log('Abuse reports seeded');
  }

  async seedDisputes(users: User[], orders: Order[]): Promise<void> {
    const disputeRepository = this.dataSource.getRepository(Dispute);

    for (let i = 0; i < 3; i++) {
      const order = faker.helpers.arrayElement(orders);
      const raisedBy = faker.helpers.arrayElement([order.buyerId, order.sellerId]);
      const user = users.find(u => u.id === raisedBy);

      if (!user) continue;

      const dispute = disputeRepository.create({
        orderId: order.id,
        raisedById: user.id,
        reason: faker.lorem.paragraph(),
        status: faker.helpers.arrayElement([DisputeStatus.OPEN, DisputeStatus.IN_REVIEW, DisputeStatus.RESOLVED, DisputeStatus.REJECTED]),
        resolution: faker.datatype.boolean() ? faker.lorem.paragraph() : null,
      });

      await disputeRepository.save(dispute);
    }

    console.log('Disputes seeded');
  }

  async seedSupportTickets(users: User[]): Promise<void> {
    const supportTicketRepository = this.dataSource.getRepository(SupportTicket);

    for (const user of users) {
      const ticketCount = faker.number.int({ min: 0, max: 2 });

      for (let i = 0; i < ticketCount; i++) {
        const supportTicket = supportTicketRepository.create({
          userId: user.id,
          subject: faker.lorem.sentence(),
          message: faker.lorem.paragraphs(2),
          status: faker.helpers.arrayElement([SupportTicketStatus.OPEN, SupportTicketStatus.IN_PROGRESS, SupportTicketStatus.RESOLVED, SupportTicketStatus.CLOSED]),
          priority: faker.helpers.arrayElement([SupportTicketPriority.LOW, SupportTicketPriority.MEDIUM, SupportTicketPriority.HIGH]),
        });

        await supportTicketRepository.save(supportTicket);
      }
    }

    console.log('Support tickets seeded');
  }

  async seedUserBalances(users: User[]): Promise<void> {
    const userBalanceRepository = this.dataSource.getRepository(UserBalance);

    for (const user of users) {
      const userBalance = userBalanceRepository.create({
        userId: user.id,
        availableBalance: faker.number.float({ min: 0, max: 1000, precision: 0.01 } as any),
        credits: faker.number.float({ min: 0, max: 500, precision: 0.01 } as any),
        earningsToDate: user.role === UserRole.SELLER ? faker.number.float({ min: 0, max: 10000, precision: 0.01 } as any) : 0,
        cancelledOrdersCredit: faker.number.float({ min: 0, max: 200, precision: 0.01 } as any),
      });

      await userBalanceRepository.save(userBalance);
    }

    console.log('User balances seeded');
  }

  async seedTransactions(users: User[], orders: Order[]): Promise<void> {
    const transactionRepository = this.dataSource.getRepository(Transaction);

    for (const user of users) {
      const transactionCount = faker.number.int({ min: 1, max: 5 });

      for (let i = 0; i < transactionCount; i++) {
        let orderId = null;

        // For buyers and sellers, associate with their orders
        if (user.role === UserRole.BUYER || user.role === UserRole.SELLER) {
          const userOrders = orders.filter(order => order.buyerId === user.id || order.sellerId === user.id);

          if (userOrders.length > 0) {
            orderId = faker.helpers.arrayElement(userOrders).id;
          }
        }

        const transaction = transactionRepository.create({
          userId: user.id,
          type: faker.helpers.arrayElement(['deposit', 'withdrawal', 'payment', 'refund', 'earning']),
          amount: faker.number.float({ min: 10, max: 500, precision: 0.01 } as any),
          currencyId: '1', // Assuming USD
          description: faker.finance.transactionDescription(),
          status: faker.helpers.arrayElement(['pending', 'completed', 'failed']),
          orderId: orderId,
        });

        await transactionRepository.save(transaction);
      }
    }

    console.log('Transactions seeded');
  }

  async seedPaymentMethods(users: User[]): Promise<void> {
    const paymentMethodRepository = this.dataSource.getRepository(PaymentMethod);

    for (const user of users) {
      const methodCount = faker.number.int({ min: 0, max: 2 });

      for (let i = 0; i < methodCount; i++) {
        const paymentMethod = paymentMethodRepository.create({
          userId: user.id,
          methodType: faker.helpers.arrayElement(['credit_card', 'paypal', 'bank_account']),
          iban: faker.finance.iban(),
          clientId: faker.string.alphanumeric(10),
          country: faker.location.countryCode(),
          state: faker.location.state({ abbreviated: true }),
          mobileNumber: faker.phone.number(),
          isDefault: i === 0, // First method is default
        });

        await paymentMethodRepository.save(paymentMethod);
      }
    }

    console.log('Payment methods seeded');
  }

  async seedReferrals(users: User[]): Promise<void> {
    const referralRepository = this.dataSource.getRepository(Referral);

    for (const user of users) {
      const referralCount = faker.number.int({ min: 0, max: 3 });

      for (let i = 0; i < referralCount; i++) {
        const referral = referralRepository.create({
          referrerId: user.id,
          referredEmail: faker.internet.email(),
          referredUserId: faker.datatype.boolean() ? faker.helpers.arrayElement(users.filter(u => u.id !== user.id)).id : null,
          status: faker.helpers.arrayElement([ReferralStatus.PENDING, ReferralStatus.COMPLETED, ReferralStatus.EXPIRED]),
          referralCode: user.referralCode,
          creditEarned: faker.number.float({ min: 0, max: 50, precision: 0.01 } as any),
          completedAt: faker.datatype.boolean() ? faker.date.recent() : null,
          expiresAt: faker.date.soon({ days: 30 }),
        });

        await referralRepository.save(referral);
      }
    }

    console.log('Referrals seeded');
  }

  async seedAffiliates(users: User[]): Promise<void> {
    const affiliateRepository = this.dataSource.getRepository(Affiliate);

    for (const user of users) {
      // Only some users are affiliates
      if (faker.datatype.boolean({ probability: 0.3 })) {
        const affiliate = affiliateRepository.create({
          userId: user.id,
          referralCode: user.referralCode,
          commissionPercent: faker.number.float({ min: 5, max: 20, precision: 0.1 } as any),
          clicks: faker.number.int({ min: 0, max: 100 }),
          signups: faker.number.int({ min: 0, max: 20 }),
          conversions: faker.number.int({ min: 0, max: 10 }),
          earnings: faker.number.float({ min: 0, max: 1000, precision: 0.01 } as any),
        });

        await affiliateRepository.save(affiliate);
      }
    }

    console.log('Affiliates seeded');
  }

  async seedReports(users: User[]): Promise<void> {
    const reportRepository = this.dataSource.getRepository(Report);

    for (const user of users) {
      // Only some users generate reports
      if (faker.datatype.boolean({ probability: 0.2 })) {
        const report = reportRepository.create({
          userId: user.id,
          reportType: faker.helpers.arrayElement(['earnings', 'transactions', 'services']),
          dateRange: faker.helpers.arrayElement(['last_week', 'last_month', 'last_quarter', 'last_year']),
          documentUrl: faker.internet.url(),
          serviceType: faker.helpers.arrayElement(['all', 'web_development', 'graphic_design']),
          orderRef: `ORD-${faker.string.alphanumeric(8).toUpperCase()}`,
          currency: faker.helpers.arrayElement(['USD', 'EUR', 'GBP']),
          totalAmount: faker.number.float({ min: 100, max: 5000, precision: 0.01 } as any),
        });

        await reportRepository.save(report);
      }
    }

    console.log('Reports seeded');
  }

  async seedBlogs(users: User[]): Promise<Blog[]> {
    const blogRepository = this.dataSource.getRepository(Blog);
    const blogs: Blog[] = [];
    const adminUsers = users.filter(user => user.role === UserRole.ADMIN);

    for (const admin of adminUsers) {
      const blogCount = faker.number.int({ min: 1, max: 3 });

      for (let i = 0; i < blogCount; i++) {
        const blog = blogRepository.create({
          authorId: admin.id,
          title: faker.lorem.sentence(),
          content: faker.lorem.paragraphs(10),
          excerpt: faker.lorem.paragraph(),
          coverImage: faker.image.url(),
          tags: Array.from({ length: faker.number.int({ min: 3, max: 8 }) }, () => faker.lorem.word()),
          status: faker.helpers.arrayElement([BlogStatus.DRAFT, BlogStatus.PUBLISHED, BlogStatus.ARCHIVED]),
          views: faker.number.int({ min: 0, max: 1000 }),
          publishedAt: faker.datatype.boolean() ? faker.date.recent() : null,
        });

        blogs.push(await blogRepository.save(blog));
      }
    }

    console.log('Blogs seeded');
    return blogs;
  }

  async seedBlogCategories(): Promise<void> {
    const blogCategoryRepository = this.dataSource.getRepository(BlogCategory);

    const categories = ['Technology', 'Design', 'Business', 'Marketing', 'Freelancing', 'Tips & Tricks'];

    for (const categoryName of categories) {
      const blogCategory = blogCategoryRepository.create({
        name: categoryName,
        description: faker.lorem.sentence(),
      });

      await blogCategoryRepository.save(blogCategory);
    }

    console.log('Blog categories seeded');
  }

  async seedBlogLikes(users: User[], blogs: Blog[]): Promise<void> {
    const blogLikeRepository = this.dataSource.getRepository(BlogLike);

    for (const blog of blogs) {
      const likeCount = faker.number.int({ min: 0, max: 20 });

      for (let i = 0; i < likeCount; i++) {
        const user = faker.helpers.arrayElement(users);

        const blogLike = blogLikeRepository.create({
          userId: user.id,
          blogId: blog.id,
        });

        await blogLikeRepository.save(blogLike);
      }
    }

    console.log('Blog likes seeded');
  }

  async seedBlogComments(users: User[], blogs: Blog[]): Promise<void> {
    const blogCommentRepository = this.dataSource.getRepository(BlogComment);

    for (const blog of blogs) {
      const commentCount = faker.number.int({ min: 0, max: 10 });

      for (let i = 0; i < commentCount; i++) {
        const user = faker.helpers.arrayElement(users);

        const blogComment = blogCommentRepository.create({
          blogId: blog.id,
          userId: user.id,
          comment: faker.lorem.paragraph(),
          status: faker.helpers.arrayElement([CommentStatus.PENDING, CommentStatus.APPROVED, CommentStatus.REJECTED]),
        });

        await blogCommentRepository.save(blogComment);
      }
    }

    console.log('Blog comments seeded');
  }
}

// Main function to run the seeder
// Main function to run the seeder
export async function runSeeder(dataSource: DataSource) {
  const seeder = new Seeder(dataSource);

  try {
    console.log('Clearing database...');
    // await seeder.clearDatabase();
    console.log('Database cleared successfully!');

    console.log('Starting database seeding...');
    await seeder.seed();
    console.log('Database seeding completed successfully!');
  } catch (error) {
    console.error('Error during seeding process:', error);
    throw error;
  }
}
