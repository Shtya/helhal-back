import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn, BeforeInsert, BeforeUpdate, Index, BaseEntity, DeleteDateColumn, ManyToMany, JoinTable, Unique } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { CoreEntity } from './core.entity';
import { Asset } from './assets.entity';

export type IUserRole = 'buyer' | 'seller' | 'admin';

export enum UserRole {
  BUYER = 'buyer',
  SELLER = 'seller',
  ADMIN = 'admin',
}

export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  PENDING_VERIFICATION = 'pending_verification',
  DELETED = 'deleted',
  INACTIVE = 'inactive',
}

interface Education {
  degree: string;
  institution: string;
  year: number;
}

interface Certification {
  name: string;
  issuingOrganization: string;
  year: number;
}

export enum SellerLevel {
  LVL1 = 'lvl1',
  LVL2 = 'lvl2',
  NEW = 'new',
  TOP = 'top',
}

export interface DeviceInfo {
  id?: string; // add this
  device_type: string;
  browser: string;
  ip_address: string;
  os: string;
  last_activity: Date;
}

@Entity('users')
export class User extends CoreEntity {
  // ---- core account ----
  @Column({ unique: true })
  username: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true, select: false })
  password: string;

  @Column()
  type: 'Business' | 'Individual';

  @Column({ nullable: true })
  phone: string;

  @Column({ name: 'profile_image', nullable: true })
  profileImage: string;

  @Column({ type: 'enum', enum: ['buyer', 'seller', 'admin'], default: 'buyer' })
  role: string;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Column({ name: 'last_login', type: 'timestamptz', nullable: true })
  lastLogin: Date;

  @Column({ type: 'jsonb', default: [] })
  devices: DeviceInfo[];

  @Column({ name: 'member_since', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  memberSince: Date;

  @Column({ name: 'deactivated_at', type: 'timestamptz', nullable: true })
  deactivatedAt: Date;

  @Column({ nullable: true, unique: true })
  googleId: string;

  @Column({ type: 'varchar', nullable: true })
  ownerType: string; // e.g. 'admin' | 'platform' | 'user'

  @Column({ nullable: true, unique: true })
  appleId: string;

  @Column({ nullable: true, select: false })
  resetPasswordToken: string;

  @Column({ nullable: true })
  lastResetPasswordSentAt: Date;

  @Column({ nullable: true })
  resetPasswordExpires: Date;

  // referrals
  @Column({ nullable: true, unique: true })
  referralCode: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'referred_by_id' })
  referredBy: User;

  @Column({ name: 'referred_by_id', nullable: true })
  referredById: string;

  @Column({ default: 0 })
  referralCount: number;

  @Column({ default: 0 })
  referralRewardsCount: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'jsonb', default: [] })
  languages: string[];

  @Column({ nullable: true })
  country: string;

  @Column({ type: 'jsonb', default: [] })
  skills: string[]; // unified to string[]

  @Column({
    name: 'seller_level',
    type: 'enum',
    enum: SellerLevel,
    nullable: true,
    default: SellerLevel.LVL1,
  })
  sellerLevel: SellerLevel;

  @Column({ name: 'last_activity', type: 'timestamptz', nullable: true })
  lastActivity: Date;

  @Column({ type: 'jsonb', default: [] })
  education: Education[];

  @Column({ type: 'jsonb', default: [] })
  certifications: Certification[];

  @Column({ name: 'intro_video_url', nullable: true })
  introVideoUrl: string;

  @Column({ name: 'portfolio_file', nullable: true })
  portfolioFile: string;

  @Column({ type: 'jsonb', default: [] })
  portfolioItems: any[];

  @Column({ name: 'response_time', type: 'decimal', nullable: true })
  responseTime: number;

  @Column({ name: 'orders_completed', default: 0 })
  ordersCompleted: number;

  @Column({ name: 'repeat_buyers', default: 0 })
  repeatBuyers: number;

  @Column({ name: 'top_rated', default: false })
  topRated: boolean;

  @Column({ name: 'delivery_time', nullable: true })
  deliveryTime: string;

  @Column({ name: 'age_group', nullable: true })
  ageGroup: string;

  @Column({ default: 0 })
  revisions: number;

  @Column({ type: 'jsonb', default: {} })
  preferences: any;

  @Column({ type: 'decimal', default: 0 })
  balance: number;

  @Column({ name: 'total_spent', type: 'decimal', default: 0 })
  totalSpent: number;

  @Column({ name: 'total_earned', type: 'decimal', default: 0 })
  totalEarned: number;

  @Column({ name: 'reputation_points', default: 0 })
  reputationPoints: number;

  // ---- relations (unchanged) ----
  @OneToMany(() => Asset, upload => upload.user)
  uploads: Asset[];

  @OneToMany(() => AccountDeactivation, deactivation => deactivation.user)
  deactivations: AccountDeactivation[];

  @OneToMany(() => Recommendation, recommendation => recommendation.user)
  recommendations: Recommendation[];

  @OneToMany(() => NotificationSetting, setting => setting.user)
  notificationSettings: NotificationSetting[];

  @OneToMany(() => Service, service => service.seller)
  services: Service[];

  @OneToMany(() => Order, order => order.buyer)
  ordersAsBuyer: Order[];

  @OneToMany(() => Order, order => order.seller)
  ordersAsSeller: Order[];

  @OneToMany(() => Conversation, conversation => conversation.buyer)
  conversationsAsBuyer: Conversation[];

  @OneToMany(() => Conversation, conversation => conversation.seller)
  conversationsAsSeller: Conversation[];

  @OneToMany(() => FavoriteConversation, favorite => favorite.user)
  favoriteConversations: FavoriteConversation[];

  @OneToMany(() => Message, message => message.sender)
  messages: Message[];

  @OneToMany(() => ServiceReview, review => review.reviewer)
  reviews: ServiceReview[];

  @OneToMany(() => Cart, cart => cart.user)
  carts: Cart[];

  @OneToMany(() => Favorite, favorite => favorite.user)
  favorites: Favorite[];

  @OneToMany(() => SavedSearch, search => search.user)
  savedSearches: SavedSearch[];

  @OneToMany(() => AbuseReport, report => report.reporter)
  abuseReports: AbuseReport[];

  @OneToMany(() => AbuseReport, report => report.reportedUser)
  reportedAgainst: AbuseReport[];

  @OneToMany(() => Dispute, dispute => dispute.raisedBy)
  disputes: Dispute[];

  @OneToMany(() => SupportTicket, ticket => ticket.user)
  supportTickets: SupportTicket[];

  @OneToMany(() => UserBalance, balance => balance.user)
  balances: UserBalance[];

  @OneToMany(() => Transaction, transaction => transaction.user)
  transactions: Transaction[];

  @OneToMany(() => PaymentMethod, method => method.user)
  paymentMethods: PaymentMethod[];

  @OneToMany(() => Referral, referral => referral.referrer)
  referrals: Referral[];

  @OneToMany(() => Affiliate, affiliate => affiliate.user)
  affiliate: Affiliate[];

  @OneToMany(() => Report, report => report.user)
  reports: Report[];

  @OneToMany(() => Job, job => job.buyer)
  jobs: Job[];

  @OneToMany(() => Proposal, proposal => proposal.seller)
  proposals: Proposal[];

  @OneToMany(() => Blog, blog => blog.author)
  blogs: Blog[];

  @OneToMany(() => BlogLike, blogLike => blogLike.user)
  blogLikes: BlogLike[];

  @OneToMany(() => BlogComment, comment => comment.user)
  blogComments: BlogComment[];

  // ---- security helpers ----
  async comparePassword(candidatePassword: string): Promise<boolean> {
    if (!this.password) return false;
    return bcrypt.compare(candidatePassword, this.password);
  }

  createPasswordResetToken(): string {
    const resetToken = crypto.randomBytes(32).toString('hex');
    this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    this.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000);
    return resetToken;
  }

  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword() {
    if (this.password && !this.password.startsWith('$2a$') && !this.password.startsWith('$2b$')) {
      const salt = await bcrypt.genSalt(12);
      this.password = await bcrypt.hash(this.password, salt);
    }
  }
}

@Entity('account_deactivations')
export class AccountDeactivation extends CoreEntity {
  @ManyToOne(() => User, user => user.deactivations)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'text' })
  reason: string;
}

@Entity('recommendations')
export class Recommendation extends CoreEntity {
  @ManyToOne(() => User, user => user.recommendations)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'enum', enum: ['personal', 'business'] })
  type: 'personal' | 'business';

  @Column({ type: 'jsonb' })
  reference: any;
}

@Entity('pending_user_registrations')
@Index(['email'], { unique: true })
export class PendingUserRegistration extends CoreEntity {
  @Column()
  username: string;

  @Column()
  email: string;

  @Column()
  passwordHash: string;

  @Column()
  verificationCode: string;

  @Column()
  expiresAt: Date;

  @Column()
  codeExpiresAt: Date;

  @Column()
  lastSentAt: Date;

  @Column({ nullable: true })
  referralCodeUsed: string;

  @Column({ type: 'enum', enum: ['buyer', 'seller', 'admin'], default: 'buyer' })
  role: string;

  @Column({ default: 'Business' })
  type: 'Business' | 'Individual';
}

@Entity('user_sessions')
export class UserSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id' })
  userId: string;

  // optional correlate to user.devices entry
  @Column({ name: 'device_id', nullable: true })
  deviceId: string | null;

  @Column({ name: 'ip_address', nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ name: 'device_type', nullable: true })
  deviceType: string | null;

  @Column({ nullable: true })
  browser: string | null;

  @Column({ nullable: true })
  os: string | null;

  @Column({ name: 'refresh_token_hash', type: 'text', nullable: true })
  refreshTokenHash: string | null;

  @Index()
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'last_activity', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  lastActivity: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at: Date;
}

// -----------------------------------------------------
// Settings Entity
// -----------------------------------------------------

@Entity('settings')
export class Setting extends CoreEntity {
  @Column({ name: 'site_name' })
  siteName: string;

  @Column({ name: 'platform_account_user_id', nullable: true })
  platformAccountUserId: string;

  @Column({ name: 'site_logo' })
  siteLogo: string;

  @Column({ name: 'privacy_policy', type: 'text' })
  privacyPolicy: string;

  @Column({ name: 'terms_of_service', type: 'text' })
  termsOfService: string;

  @Column({ name: 'contact_email' })
  contactEmail: string;

  @Column({ name: 'support_phone' })
  supportPhone: string;

  @Column({ name: 'platform_percent', type: 'decimal', default: 0 })
  platformPercent: number;

  @Column({ name: 'default_currency' })
  defaultCurrency: number;

  @Column({ name: 'jobs_require_approval', default: true })
  jobsRequireApproval: boolean;

  @Column({ name: 'popular_services', type: 'int', array: true, default: [] })
  popularServices: number[];

  @Column({ name: 'clients_experiences', type: 'int', array: true, default: [] })
  clientsExperiences: number[];

  @Column({ name: 'featured_categories', type: 'int', array: true, default: [] })
  featuredCategories: number[];

  @Column({ name: 'recommended_services', type: 'int', array: true, default: [] })
  recommendedServices: number[];

  @Column({ name: 'business_recommendations', type: 'int', array: true, default: [] })
  businessRecommendations: number[];

  @Column({ name: 'faqs', type: 'int', array: true, default: [] })
  faqs: number[];

  @Column({ name: 'buyer_stories', type: 'int', array: true, default: [] })
  buyerStories: number[];
}

@Entity('wallets')
@Unique(['userId'])
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Reference to a user OR "platform" for global wallet
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  // Wallet balance in smallest currency unit (or just decimal if simpler)
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  balance: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// -----------------------------------------------------
// Coins and Service Boosts
// -----------------------------------------------------

@Entity('service_boosts')
export class ServiceBoost extends CoreEntity {
  @Column({ name: 'service_id' })
  serviceId: string;

  @ManyToOne(() => User, user => user.services)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'used_coins' })
  usedCoins: number;

  @Column({ name: 'start_date', type: 'timestamptz' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'timestamptz' })
  endDate: Date;

  @Column({ type: 'enum', enum: ['active', 'expired'], default: 'active' })
  status: 'active' | 'expired';
}

@Entity('notification_settings')
export class NotificationSetting extends CoreEntity {
  @ManyToOne(() => User, user => user.notificationSettings)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', unique: true })
  userId: string;

  @Column({ type: 'jsonb', default: {} })
  settings: any;
}

@Entity('notifications')
export class Notification extends CoreEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @Column()
  type: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  @Column({ name: 'related_entity_type' })
  relatedEntityType: string;

  @Column({ name: 'related_entity_id' })
  relatedEntityId: string;
}

// -----------------------------------------------------
// Categories and Services
// -----------------------------------------------------

export enum CategoryType {
  CATEGORY = 'category',
  SUBCATEGORY = 'subcategory',
}

@Entity('categories')
export class Category extends CoreEntity {
  @Column({ type: 'enum', enum: CategoryType, default: CategoryType.CATEGORY })
  type: CategoryType;

  @Column()
  name: string;

  @Column({ nullable: true })
  parentId: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  image: string;

  @OneToMany(() => Service, service => service.category)
  services: Service[];

  @OneToMany(() => Service, service => service.subcategory)
  subcategoryServices: Service[];

  @BeforeInsert()
  @BeforeUpdate()
  generateSlug() {
    if (this.name) {
      this.slug = this.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
    }
  }
}

export enum ServiceStatus {
  ACTIVE = 'Active',
  DRAFT = 'Draft',
  PENDING = 'Pending',
  PAUSED = 'Paused',
  DENIED = 'Denied',
}

export interface Package {
  type: string; // e.g. "basic" | "standard" | "premium"
  price: number; // cost of the package
  title: string; // package title
  description: string; // package description
  revisions: number; // allowed revisions
  deliveryTime: number; // delivery time in days
  features: string[];
  test?: boolean; // optional flag if used in your case
}

@Entity('services')
export class Service extends CoreEntity {
  @ManyToOne(() => User, user => user.services)
  @JoinColumn({ name: 'seller_id' })
  seller: User;

  @Column({ name: 'seller_id' })
  sellerId: string;

  @Column()
  title: string;

  @Column({ unique: true, nullable: true })
  slug: string;

  @Column()
  brief: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: any;

  @Column({ name: 'search_tags', type: 'text', array: true, default: [] })
  searchTags: string[];

  @ManyToOne(() => Category, category => category.services)
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @Column({ name: 'category_id' })
  categoryId: string;

  @ManyToOne(() => Category, category => category.subcategoryServices)
  @JoinColumn({ name: 'subcategory_id' })
  subcategory: Category;

  @Column({ name: 'subcategory_id', nullable: true })
  subcategoryId: string;

  @Column({ type: 'enum', enum: ServiceStatus, default: ServiceStatus.DRAFT })
  status: ServiceStatus;

  @Column({ default: 0 })
  impressions: number;

  @Column({ default: 0 })
  clicks: number;

  @Column({ name: 'orders_count', default: 0 })
  ordersCount: number;

  @Column({ default: 0 })
  cancellations: number;

  @Column({ type: 'float', default: 0 })
  performanceScore: number;

  @Column({ default: false })
  fastDelivery: boolean;

  @Column({ default: false })
  additionalRevision: boolean;

  @Column({ type: 'float', default: 0, nullable: true })
  rating: number;

  @Column({ type: 'jsonb', default: [] })
  faq: any[];

  @Column({ type: 'jsonb', default: [] })
  packages: Package[];

  @Column({ type: 'jsonb', default: [] })
  // {type<image | video | document> , fileName ,url}
  gallery: any[];

  @OneToMany(() => ServiceRequirement, requirement => requirement.service)
  requirements: ServiceRequirement[];

  @OneToMany(() => Order, order => order.service)
  orders: Order[];

  @OneToMany(() => ServiceReview, review => review.service)
  reviews: ServiceReview[];

  @OneToMany(() => CartItem, item => item.service)
  cartItems: CartItem[];

  @OneToMany(() => Favorite, favorite => favorite.service)
  favorites: Favorite[];

  @BeforeInsert()
  @BeforeUpdate()
  generateSlug() {
    if (this.title) {
      this.slug = this.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
    }
  }
}

@Entity('service_requirements')
export class ServiceRequirement extends CoreEntity {
  @ManyToOne(() => Service, service => service.requirements)
  @JoinColumn({ name: 'service_id' })
  service: Service;

  @Column({ name: 'service_id' })
  serviceId: string;

  @Column({ type: 'enum', enum: ['text', 'multiple_choice', 'file'] })
  requirementType: 'text' | 'multiple_choice' | 'file';

  @Column({ type: 'text' })
  question: string;

  @Column({ name: 'is_required', default: false })
  isRequired: boolean;

  @Column({ type: 'text', array: true, default: [] })
  options: string[];
}

// -----------------------------------------------------
// Jobs and Proposals System
// -----------------------------------------------------

export enum BudgetType {
  FIXED = 'fixed',
  HOURLY = 'hourly',
}

export enum JobStatus {
  PENDING = 'pending',
  DRAFT = 'draft',
  PUBLISHED = 'published',
  CLOSED = 'closed',
  AWARDED = 'awarded',
  COMPLETED = 'completed',
}

@Entity('jobs')
export class Job extends CoreEntity {
  @ManyToOne(() => User, user => user.jobs)
  @JoinColumn({ name: 'buyer_id' })
  buyer: User;

  @Column({ name: 'buyer_id' })
  buyerId: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @ManyToOne(() => Category, category => category.services)
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @Column({ name: 'category_id' })
  categoryId: string;

  @ManyToOne(() => Category, category => category.subcategoryServices)
  @JoinColumn({ name: 'subcategory_id' })
  subcategory: Category;

  @Column({ name: 'subcategory_id', nullable: true })
  subcategoryId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  budget: number;

  @Column({ type: 'enum', enum: BudgetType, default: BudgetType.FIXED })
  budgetType: BudgetType;

  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.DRAFT })
  status: JobStatus;

  @Column()
  preferredDeliveryDays: number;

  @Column({ name: 'skills_required', type: 'text', array: true, default: [] })
  skillsRequired: string[];

  @Column({ type: 'jsonb', default: [] })
  attachments: Array<{
    name: string;
    url: string;
    type: string;
    uploadedAt: Date;
  }>;

  @Column({ name: 'additional_info', type: 'text', nullable: true })
  additionalInfo: string;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date;

  @OneToMany(() => Order, order => order.job)
  orders: Order[];

  @OneToMany(() => Proposal, proposal => proposal.job)
  proposals: Proposal[];
}

export enum ProposalStatus {
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

@Entity('proposals')
export class Proposal extends CoreEntity {
  @ManyToOne(() => Job, job => job.proposals)
  @JoinColumn({ name: 'job_id' })
  job: Job;

  @Column({ name: 'job_id' })
  jobId: string;

  @ManyToOne(() => User, user => user.proposals)
  @JoinColumn({ name: 'seller_id' })
  seller: User;

  @Column({ name: 'seller_id' })
  sellerId: string;

  @Column({ name: 'cover_letter', type: 'text' })
  coverLetter: string;

  @Column({ name: 'bid_amount', type: 'decimal' })
  bidAmount: number;

  @Column({ type: 'text', nullable: true })
  portfolio: string;

  @Column({ type: 'enum', enum: BudgetType })
  bidType: BudgetType;

  @Column()
  estimatedTimeDays: number;

  @Column({ type: 'enum', enum: ProposalStatus, default: ProposalStatus.SUBMITTED })
  status: ProposalStatus;

  @Column({ type: 'jsonb', default: [] })
  attachments: Array<{
    name: string;
    url: string;
    type: string;
    uploadedAt: Date;
  }>;

  @Column({ name: 'submitted_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  submittedAt: Date;

  @OneToMany(() => Order, order => order.proposal)
  orders: Order[];
}

// -----------------------------------------------------
// Orders, Invoices and Payments
// -----------------------------------------------------

export enum OrderStatus {
  PENDING = 'Pending',
  ACCEPTED = 'Accepted',
  DELIVERED = 'Delivered',
  COMPLETED = 'Completed',
  CANCELLED = 'Cancelled',
  MISSING_DETAILS = 'Missing Details',
  DISPUTED = 'Disputed',
}

export enum PackageType {
  BASIC = 'basic',
  STANDARD = 'standard',
  PREMIUM = 'premium',
}

@Entity('orders')
export class Order extends CoreEntity {
  @ManyToOne(() => User, user => user.ordersAsBuyer)
  @JoinColumn({ name: 'buyer_id' })
  buyer: User;

  @Column({ name: 'buyer_id' })
  buyerId: string;

  @ManyToOne(() => User, user => user.ordersAsSeller)
  @JoinColumn({ name: 'seller_id' })
  seller: User;

  @Column({ name: 'seller_id' })
  sellerId: string;

  @ManyToOne(() => Service, service => service.orders)
  @JoinColumn({ name: 'service_id' })
  service: Service;

  @Column({ name: 'service_id', nullable: true })
  serviceId: string;

  @ManyToOne(() => Job, job => job.orders)
  @JoinColumn({ name: 'job_id' })
  job: Job;

  @Column({ name: 'job_id', nullable: true })
  jobId: string;

  @ManyToOne(() => Proposal, proposal => proposal.orders)
  @JoinColumn({ name: 'proposal_id' })
  proposal: Proposal;

  @Column({ name: 'proposal_id', nullable: true })
  proposalId: string;

  @Column()
  title: string;

  @Column({ default: 1 })
  quantity: number;

  @Column({ name: 'total_amount', type: 'decimal' })
  totalAmount: number;

  @Column({ type: 'enum', enum: PackageType })
  packageType: PackageType;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column({ name: 'requirements_answers', type: 'jsonb', default: [] })
  requirementsAnswers: any[];

  @Column({ type: 'jsonb', default: [] })
  timeline: any[];

  @Column({ name: 'order_date', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  orderDate: Date;

  @Column({ name: 'due_date', type: 'timestamptz', nullable: true })
  dueDate: Date;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date;

  @OneToMany(() => Invoice, invoice => invoice.order)
  invoices: Invoice[];
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
}

@Entity('invoices')
export class Invoice extends CoreEntity {
  @Column({ name: 'invoice_number', unique: true })
  invoiceNumber: string;

  @ManyToOne(() => Order, order => order.invoices)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'order_id', unique: true })
  orderId: string;

  @Column({ type: 'decimal' })
  subtotal: number;

  @Column({ name: 'service_fee', type: 'decimal' })
  serviceFee: number;

  @Column({ name: 'platform_percent', type: 'decimal' })
  platformPercent: number;

  @Column({ name: 'total_amount', type: 'decimal' })
  totalAmount: number;

  // @Column({ name: 'currency_id' })
  // currencyId: string;

  @Column({ name: 'issued_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  issuedAt: Date;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  paymentStatus: PaymentStatus;

  @Column({ name: 'payment_method', nullable: true })
  paymentMethod: string;

  @Column({ name: 'transaction_id', nullable: true })
  transactionId: string;

  @OneToMany(() => Payment, payment => payment.invoice)
  payments: Payment[];
}

export enum PaymentMethodType {
  CARD = 'card',
  WALLET = 'wallet',
  BANK = 'bank',
  PAYPAL = 'paypal',
  STRIPE = 'stripe',
}

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

@Entity('payments')
export class Payment extends CoreEntity {
  @ManyToOne(() => Invoice, invoice => invoice.payments)
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @Column({ name: 'invoice_id' })
  invoiceId: string;

  @ManyToOne(() => User, user => user.transactions)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'decimal' })
  amount: number;

  @Column({ name: 'currency_id' })
  currencyId: string;

  @Column({ type: 'enum', enum: PaymentMethodType })
  method: PaymentMethodType;

  @Column({ type: 'enum', enum: TransactionStatus, default: TransactionStatus.PENDING })
  status: TransactionStatus;

  @Column({ name: 'transaction_id', unique: true })
  transactionId: string;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date;
}

@Entity('currencies')
export class Currency extends CoreEntity {
  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column()
  symbol: string;

  @Column({ name: 'exchange_rate', type: 'decimal' })
  exchangeRate: number;
}

// -----------------------------------------------------
// Messaging System
// -----------------------------------------------------

@Entity('conversations')
export class Conversation extends CoreEntity {
  @ManyToOne(() => User, user => user.conversationsAsBuyer)
  @JoinColumn({ name: 'buyer_id' })
  buyer: User;

  @Column({ name: 'buyer_id' })
  buyerId: string;

  @ManyToOne(() => User, user => user.conversationsAsSeller)
  @JoinColumn({ name: 'seller_id' })
  seller: User;

  @Column({ name: 'seller_id' })
  sellerId: string;

  @ManyToOne(() => Service, service => service.orders)
  @JoinColumn({ name: 'service_id' })
  service: Service;

  @Column({ name: 'service_id', nullable: true })
  serviceId: string;

  @ManyToOne(() => Order, order => order.invoices)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'order_id', nullable: true })
  orderId: string;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt: Date;

  @OneToMany(() => FavoriteConversation, favorite => favorite.conversation)
  favorites: FavoriteConversation[];

  @OneToMany(() => Message, message => message.conversation)
  messages: Message[];
}

@Entity('messages')
export class Message extends CoreEntity {
  @ManyToOne(() => Conversation, conversation => conversation.messages)
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @Column({ name: 'conversation_id' })
  conversationId: string;

  @ManyToOne(() => User, user => user.messages)
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  @Column({ name: 'sender_id' })
  senderId: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: process.env.DB_TYPE === 'postgres' ? 'jsonb' : 'text', nullable: true })
  attachments?: string[];

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date;
}

@Entity('favorite_conversations')
export class FavoriteConversation extends CoreEntity {
  @ManyToOne(() => User, user => user.favoriteConversations)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => Conversation, conversation => conversation.favorites)
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @Column({ name: 'conversation_id' })
  conversationId: string;
}

// -----------------------------------------------------
// Ratings and Reviews
// -----------------------------------------------------

@Entity('service_reviews')
export class ServiceReview extends CoreEntity {
  @ManyToOne(() => Service, service => service.reviews)
  @JoinColumn({ name: 'service_id' })
  service: Service;

  @Column({ name: 'service_id' })
  serviceId: string;

  @ManyToOne(() => User, user => user.reviews)
  @JoinColumn({ name: 'reviewer_id' })
  reviewer: User;

  @Column({ name: 'reviewer_id' })
  reviewerId: string;

  @ManyToOne(() => User, user => user.services)
  @JoinColumn({ name: 'seller_id' })
  seller: User;

  @Column({ name: 'seller_id' })
  sellerId: string;

  @Column()
  rating: number;

  @Column({ type: 'text', nullable: true })
  comment: string;

  @Column({ name: 'seller_response', type: 'text', nullable: true })
  sellerResponse: string;
}

// -----------------------------------------------------
// Lists and Favorites
// -----------------------------------------------------

@Entity('cart')
export class Cart extends CoreEntity {
  @ManyToOne(() => User, user => user.carts)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @OneToMany(() => CartItem, item => item.cart)
  items: CartItem[];
}

@Entity('cart_items')
export class CartItem extends CoreEntity {
  @ManyToOne(() => Cart, cart => cart.items)
  @JoinColumn({ name: 'cart_id' })
  cart: Cart;

  @Column({ name: 'cart_id' })
  cartId: string;

  @ManyToOne(() => Service, service => service.cartItems)
  @JoinColumn({ name: 'service_id' })
  service: Service;

  @Column({ name: 'service_id' })
  serviceId: string;

  @Column({ type: 'enum', enum: PackageType })
  packageType: PackageType;

  @Column({ default: 1 })
  quantity: number;

  @Column({ name: 'price_snapshot', type: 'decimal' })
  priceSnapshot: number;

  @Column({ name: 'extra_services', type: 'jsonb', default: [] })
  extraServices: any[];
}

@Entity('favorites')
export class Favorite extends CoreEntity {
  @ManyToOne(() => User, user => user.favorites)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => Service, service => service.favorites)
  @JoinColumn({ name: 'service_id' })
  service: Service;

  @Column({ name: 'service_id' })
  serviceId: string;
}

// -----------------------------------------------------
// Smart Alerts
// -----------------------------------------------------

@Entity('saved_searches')
export class SavedSearch extends CoreEntity {
  @ManyToOne(() => User, user => user.savedSearches)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'text' })
  query: string;

  @Column({ type: 'jsonb', default: {} })
  filters: any;

  @Column({ default: true })
  notify: boolean;
}

// -----------------------------------------------------
// Content and User Reporting
// -----------------------------------------------------

export enum AbuseReportStatus {
  PENDING = 'pending',
  REVIEWED = 'reviewed',
  DISMISSED = 'dismissed',
  ACTION_TAKEN = 'action_taken',
}

@Entity('abuse_reports')
export class AbuseReport extends CoreEntity {
  @ManyToOne(() => User, user => user.abuseReports)
  @JoinColumn({ name: 'reporter_id' })
  reporter: User;

  @Column({ name: 'reporter_id' })
  reporterId: string;

  @ManyToOne(() => User, user => user.reportedAgainst)
  @JoinColumn({ name: 'reported_user_id' })
  reportedUser: User;

  @Column({ name: 'reported_user_id', nullable: true })
  reportedUserId: string;

  @ManyToOne(() => Service, service => service.reviews)
  @JoinColumn({ name: 'reported_service_id' })
  reportedService: Service;

  @Column({ name: 'reported_service_id', nullable: true })
  reportedServiceId: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'enum', enum: AbuseReportStatus, default: AbuseReportStatus.PENDING })
  status: AbuseReportStatus;
}

// -----------------------------------------------------
// Disputes and Arbitration
// -----------------------------------------------------

export enum DisputeStatus {
  OPEN = 'open',
  IN_REVIEW = 'in_review',
  RESOLVED = 'resolved',
  REJECTED = 'rejected',
}

@Entity('disputes')
export class Dispute extends CoreEntity {
  @ManyToOne(() => Order, order => order.invoices)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'order_id' })
  orderId: string;

  @ManyToOne(() => User, user => user.disputes)
  @JoinColumn({ name: 'raised_by' })
  raisedBy: User;

  @Column({ name: 'raised_by' })
  raisedById: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'enum', enum: DisputeStatus, default: DisputeStatus.OPEN })
  status: DisputeStatus;

  @Column({ type: 'text', nullable: true })
  resolution: string;

  @Column({ type: 'boolean', default: false })
  resolutionApplied: boolean;

  @Column({ type: 'varchar', nullable: true })
  sellerPayoutTxId: string | null;

  @Column({ type: 'varchar', nullable: true })
  buyerRefundTxId: string | null;
}

@Entity('dispute_messages')
export class DisputeMessage extends CoreEntity {
  @ManyToOne(() => Dispute)
  @JoinColumn({ name: 'dispute_id' })
  dispute: Dispute;

  @Column({ name: 'dispute_id' })
  disputeId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  @Column({ name: 'sender_id' })
  senderId: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'jsonb', default: [] })
  attachments: any[];
}

// -----------------------------------------------------
// Technical Support
// -----------------------------------------------------

export enum SupportTicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum SupportTicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

@Entity('support_tickets')
export class SupportTicket extends CoreEntity {
  @ManyToOne(() => User, user => user.supportTickets)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'enum', enum: SupportTicketStatus, default: SupportTicketStatus.OPEN })
  status: SupportTicketStatus;

  @Column({ type: 'enum', enum: SupportTicketPriority, default: SupportTicketPriority.LOW })
  priority: SupportTicketPriority;
}

// -----------------------------------------------------
// Accounting and Payments System
// -----------------------------------------------------

@Entity('user_balances')
export class UserBalance extends CoreEntity {
  @ManyToOne(() => User, user => user.balances)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', unique: true })
  userId: string;

  @Column({ name: 'available_balance', type: 'decimal', default: 0 })
  availableBalance: number;

  @Column({ type: 'decimal', default: 0 })
  credits: number;

  @Column({ name: 'earnings_to_date', type: 'decimal', default: 0 })
  earningsToDate: number;

  @Column({ name: 'cancelled_orders_credit', type: 'decimal', default: 0 })
  cancelledOrdersCredit: number;
}

@Entity('transactions')
export class Transaction extends CoreEntity {
  @ManyToOne(() => User, user => user.transactions)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column()
  type: string;

  @Column({ type: 'decimal' })
  amount: number;

  @Column({ name: 'currency_id' })
  currencyId: string;

  @Column({ type: 'text' })
  description: string;

  @Column()
  status: string;

  @ManyToOne(() => Order, order => order.invoices)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'order_id', nullable: true })
  orderId: string;
}

@Entity('payment_methods')
export class PaymentMethod extends CoreEntity {
  @ManyToOne(() => User, user => user.paymentMethods)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'method_type' })
  methodType: string;

  @Column({ nullable: true })
  iban: string;

  @Column({ name: 'client_id', nullable: true })
  clientId: string;

  @Column({ name: 'client_secret', nullable: true, select: false })
  clientSecret: string;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  state: string;

  @Column({ name: 'mobile_number', nullable: true })
  mobileNumber: string;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;
}

// Add to global.entity.ts

@Entity('user_billing_info')
export class UserBillingInfo extends CoreEntity {
  @Column({ name: 'user_id', unique: true })
  userId: string;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ name: 'country' })
  country: string;

  @Column({ name: 'state' })
  state: string;

  @Column({ name: 'is_saudi_resident', nullable: true })
  isSaudiResident: boolean;

  @Column({ name: 'agree_to_invoice_emails', default: false })
  agreeToInvoiceEmails: boolean;

  @ManyToOne(() => User, user => user.balances)
  @JoinColumn({ name: 'user_id' })
  user: User;
}

@Entity('user_bank_accounts')
export class UserBankAccount extends CoreEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ name: 'iban' })
  iban: string;

  @Column({ name: 'client_id', nullable: true })
  clientId: string;

  @Column({ name: 'client_secret', nullable: true, select: false })
  clientSecret: string;

  @Column({ name: 'country' })
  country: string;

  @Column({ name: 'state' })
  state: string;

  @Column({ name: 'mobile_number' })
  mobileNumber: string;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ name: 'bank_name', nullable: true })
  bankName: string;

  @Column({ name: 'account_number', nullable: true })
  accountNumber: string;

  @ManyToOne(() => User, user => user.paymentMethods)
  @JoinColumn({ name: 'user_id' })
  user: User;
}

// -----------------------------------------------------
// Referral System
// -----------------------------------------------------

export enum ReferralStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
}

@Entity('referrals')
export class Referral extends CoreEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referrer_id' })
  referrer: User;

  @Column({ name: 'referrer_id' })
  referrerId: string;

  @Column({ name: 'referred_email' })
  referredEmail: string;

  @Column({ name: 'referred_user_id', nullable: true })
  referredUserId: string;

  @Column({ type: 'enum', enum: ReferralStatus, default: ReferralStatus.PENDING })
  status: ReferralStatus;

  @Column({ name: 'referral_code' })
  referralCode: string;

  @Column({ name: 'credit_earned', type: 'decimal', precision: 10, scale: 2, default: 0 })
  creditEarned: number;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date;

  @Column({ name: 'expires_at', default: null, type: 'timestamptz' })
  expiresAt: Date;
}

@Entity('affiliates')
export class Affiliate extends CoreEntity {
  @ManyToOne(() => User, user => user.affiliate)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'referral_code', unique: true })
  referralCode: string;

  @Column({ name: 'commission_percent', type: 'decimal', default: 10 })
  commissionPercent: number;

  @Column({ default: 0 })
  clicks: number;

  @Column({ default: 0 })
  signups: number;

  @Column({ default: 0 })
  conversions: number;

  @Column({ type: 'decimal', default: 0 })
  earnings: number;
}

// -----------------------------------------------------
// Statistics and Reports System
// -----------------------------------------------------

@Entity('reports')
export class Report extends CoreEntity {
  @ManyToOne(() => User, user => user.reports)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'report_type' })
  reportType: string;

  @Column({ name: 'date_range' })
  dateRange: string;

  @Column({ name: 'document_url' })
  documentUrl: string;

  @Column({ name: 'service_type' })
  serviceType: string;

  @Column({ name: 'order_ref' })
  orderRef: string;

  @Column({ name: 'currency' })
  currency: string;

  @Column({ name: 'total_amount', type: 'decimal' })
  totalAmount: number;
}

// -----------------------------------------------------
// Blog System
// -----------------------------------------------------

export enum BlogStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

@Entity('blogs')
export class Blog extends CoreEntity {
  @ManyToOne(() => User, user => user.blogs)
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ name: 'author_id' })
  authorId: string;

  @Column()
  title: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text', nullable: true })
  excerpt: string;

  @Column({ name: 'cover_image', nullable: true })
  coverImage: string;

  @Column({ type: 'text', array: true, default: [] })
  tags: string[];

  @Column({ type: 'enum', enum: BlogStatus, default: BlogStatus.DRAFT })
  status: BlogStatus;

  @Column({ default: 0 })
  views: number;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date;

  @OneToMany(() => BlogComment, comment => comment.blog)
  comments: BlogComment[];

  @OneToMany(() => BlogLike, blogLike => blogLike.blog)
  likes: BlogLike[];

  @ManyToMany(() => BlogCategory, category => category.blogs)
  @JoinTable({
    name: 'blog_category_mapping',
    joinColumn: { name: 'blog_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'category_id', referencedColumnName: 'id' },
  })
  categories: BlogCategory[];
}

@Entity('blog_likes')
@Index(['userId', 'blogId'], { unique: true }) // Ensure a user can only like a blog once
export class BlogLike extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'blog_id' })
  blogId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => User, user => user.blogLikes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Blog, blog => blog.likes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'blog_id' })
  blog: Blog;
}

export enum CommentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('blog_comments')
export class BlogComment extends CoreEntity {
  @ManyToOne(() => Blog, blog => blog.comments)
  @JoinColumn({ name: 'blog_id' })
  blog: Blog;

  @Column({ name: 'blog_id' })
  blogId: string;

  @ManyToOne(() => User, user => user.blogComments)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'text' })
  comment: string;

  @Column({ type: 'enum', enum: CommentStatus, default: CommentStatus.PENDING })
  status: CommentStatus;
}

@Entity('blog_categories')
export class BlogCategory extends CoreEntity {
  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @ManyToMany(() => Blog, blog => blog.categories)
  blogs: Blog[];
}

// -----------------------------------------------------
// OAuth State Functions
// -----------------------------------------------------

export interface OAuthState {
  redirectPath: string;
  referralCode?: string;
}

export const createOAuthState = (redirectPath: string, referralCode?: string): string => {
  const stateObject: OAuthState = {
    redirectPath,
    referralCode,
  };
  const jsonString = JSON.stringify(stateObject);
  return Buffer.from(jsonString).toString('base64');
};

export const parseOAuthState = (state: string): OAuthState => {
  try {
    const decodedString = Buffer.from(state, 'base64').toString('utf8');
    const stateObject: OAuthState = JSON.parse(decodedString);

    if (typeof stateObject.redirectPath !== 'string') {
      throw new Error('Invalid OAuth state');
    }

    return stateObject;
  } catch (error) {
    console.error('Error parsing OAuth state:', error);
    throw new Error('Invalid OAuth state');
  }
};
