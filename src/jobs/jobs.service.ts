import { Injectable, NotFoundException, ForbiddenException, BadRequestException, forwardRef, Inject, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In, DataSource } from 'typeorm';
import { Job, Proposal, User, Category, Order, Notification, JobStatus, ProposalStatus, UserRole, OrderStatus, Setting, PaymentStatus, PackageType, Invoice, UserRelatedAccount, Country, State } from 'entities/global.entity';
import { CreateJobDto } from 'dto/job.dto';
import { PermissionBitmaskHelper } from 'src/auth/permission-bitmask.helper';
import { Permissions } from 'entities/permissions';
import { formatSearchTerm } from 'utils/search.helper';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job)
    public jobRepository: Repository<Job>,
    @InjectRepository(Proposal)
    public proposalRepository: Repository<Proposal>,
    @InjectRepository(User)
    public userRepository: Repository<User>,
    @InjectRepository(Category)
    public categoryRepository: Repository<Category>,
    @InjectRepository(Country)
    public countryRepository: Repository<Country>,
    @InjectRepository(State)
    public stateRepository: Repository<State>,
    @InjectRepository(Order)
    public orderRepository: Repository<Order>,
    @InjectRepository(Notification)
    public notificationRepository: Repository<Notification>,
    @InjectRepository(Setting)
    public settingRepository: Repository<Setting>,
    @InjectRepository(Invoice)
    public invoiceRepo: Repository<Invoice>,
    @InjectRepository(UserRelatedAccount)
    public userAccountsRepo: Repository<UserRelatedAccount>,
    private readonly dataSource: DataSource,
  ) { }

  async getJobs(query: any) {
    const {
      page = 1,
      limit = 50,
      search = '',
      category,
      budgetType = '',
      max7days,
      withAttachments,
      priceRange = '',
      customBudget,
      country,
      state,
      sortBy = 'created_at',
      sortOrder = 'DESC',
    } = query;

    const skip = (page - 1) * limit;

    const qb = this.jobRepository.createQueryBuilder('job')
      .leftJoinAndSelect('job.buyer', 'buyer')
      .leftJoinAndSelect('buyer.person', 'person')
      .leftJoinAndSelect('job.category', 'category')
      .leftJoinAndSelect('job.country', 'country')
      .leftJoinAndSelect('job.state', 'state')
      .where('job.status = :status', { status: 'published' });

    // --- Search ---
    // Use your reusable helper function
    const { formattedSearch, rawSearch } = formatSearchTerm(search);

    if (formattedSearch && rawSearch) {
      qb.andWhere(
        `(
      job.search_vector @@ to_tsquery('english', :formattedSearch) OR 
      job.search_vector @@ plainto_tsquery('arabic', normalize_arabic(:rawSearch))
    )`,
        { formattedSearch, rawSearch }
      );
    }


    // ---  filter ---
    if (country) {
      qb.andWhere('job.countryId = :countryId', { countryId: country });
    }

    if (state) {
      qb.andWhere('job.stateId = :stateId', { stateId: state });
    }

    if (category) {
      qb.andWhere('job.categoryId = :categoryId', { categoryId: category });
    }

    // --- Budget type filter ---
    if (budgetType && ['fixed', 'hourly'].includes(budgetType.toLowerCase())) {
      qb.andWhere('job.budgetType = :budgetType', { budgetType: budgetType.toLowerCase() });
    }

    // --- Max 7 days ---
    if (max7days === 'true' || max7days === true) {
      qb.andWhere('job.preferredDeliveryDays <= 7');
    }

    // --- Attachments filter ---
    if (withAttachments === 'true' || withAttachments === true) {
      qb.andWhere("jsonb_array_length(job.attachments) > 0");
    }

    // --- Price range filter ---
    if (priceRange) {
      const priceRanges: Record<string, [number, number]> = {
        u1000: [0, 1000],
        m1000_3600: [1000, 3600],
        h3600: [3600, 999999],
      };

      if (priceRange === 'custom' && customBudget) {
        qb.andWhere('job.budget <= :customBudget', { customBudget: Number(customBudget) });
      } else if (priceRanges[priceRange]) {
        const [min, max] = priceRanges[priceRange];
        qb.andWhere('job.budget BETWEEN :min AND :max', { min, max });
      }
    }

    // --- Sorting ---
    const validSortFields = ['created_at', 'budget', 'title', 'preferredDeliveryDays'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
    const order: 'ASC' | 'DESC' = sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`job.${sortField}`, order);

    // --- Total count for pagination ---
    const [jobs, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      records: jobs,
      per_page: limit,
      current_page: page,
      total_records: total
    };
  }

  async adminGetJobs(query: any) {
    const {
      page = 1,
      limit = 50,
      search = '',
      category,
      budgetType = '',
      max7days,
      withAttachments,
      priceRange = '',
      customBudget,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      status,
    } = query;

    const skip = (page - 1) * limit;

    const qb = this.jobRepository.createQueryBuilder('job')
      .leftJoinAndSelect('job.buyer', 'buyer')
      .leftJoinAndSelect('buyer.person', 'person')
      .leftJoinAndSelect('job.category', 'category')
      .leftJoinAndSelect('job.country', 'country')
      .leftJoinAndSelect('job.state', 'state')
      // Map the number of proposals
      .loadRelationCountAndMap('job.proposalsLength', 'job.proposals');


    if (status) {
      qb.where('job.status = :status', { status: status });
    }

    // --- Search ---
    if (search) {
      qb.andWhere('(job.title ILIKE :search)', { search: `%${search}%` });
    }

    // --- Category filter ---
    if (category) {
      qb.andWhere('job.categoryId = :categoryId', { categoryId: category });
    }

    // --- Budget type filter ---
    if (budgetType && ['fixed', 'hourly'].includes(budgetType.toLowerCase())) {
      qb.andWhere('job.budgetType = :budgetType', { budgetType: budgetType.toLowerCase() });
    }

    // --- Max 7 days ---
    if (max7days === 'true' || max7days === true) {
      qb.andWhere('job.preferredDeliveryDays <= 7');
    }

    // --- Attachments filter ---
    if (withAttachments === 'true' || withAttachments === true) {
      qb.andWhere("jsonb_array_length(job.attachments) > 0");
    }

    // --- Price range filter ---
    if (priceRange) {
      const priceRanges: Record<string, [number, number]> = {
        u1000: [0, 1000],
        m1000_3600: [1000, 3600],
        h3600: [3600, 999999],
      };

      if (priceRange === 'custom' && customBudget) {
        qb.andWhere('job.budget <= :customBudget', { customBudget: Number(customBudget) });
      } else if (priceRanges[priceRange]) {
        const [min, max] = priceRanges[priceRange];
        qb.andWhere('job.budget BETWEEN :min AND :max', { min, max });
      }
    }

    // --- Sorting ---
    const validSortFields = ['created_at', 'budget', 'title', 'preferredDeliveryDays'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
    const order: 'ASC' | 'DESC' = sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`job.${sortField}`, order);

    // --- Total count for pagination ---
    const [jobs, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      records: jobs,
      per_page: limit,
      current_page: page,
      total_records: total
    };
  }

  async searchJobs(query: any) {
    const { q, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const [jobs, total] = await this.jobRepository.findAndCount({
      where: [
        { title: Like(`%${q}%`), status: 'published' },
        { description: Like(`%${q}%`), status: 'published' },
        { skillsRequired: In([q]), status: 'published' },
      ],
      relations: {
        buyer: {
          person: true
        },
        category: true
      },
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    } as any);

    return {
      jobs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getJob(jobId: string, userId?: string) {
    const job = await this.jobRepository.findOne({
      where: { id: jobId, },
      relations: {
        buyer: {
          person: true, // Loads the buyer's profile (name, email, etc.)
        },
        category: true,
        subcategory: true,
        country: true,
        state: true,
        proposals: {
          seller: {
            person: true, // Loads the profile for every seller who sent a proposal
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.buyerId != userId && job.status != JobStatus.PUBLISHED) {
      throw new NotFoundException('Job not found');
    }

    return job;
  }

  async createJob(userId: string, createJobDto: CreateJobDto) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');


    const category = await this.categoryRepository.findOne({ where: { id: createJobDto.categoryId } } as any);
    if (!category) throw new NotFoundException('Category not found');


    if (createJobDto.subcategoryId) {
      const subcategory = await this.categoryRepository.findOne({ where: { id: createJobDto.subcategoryId } } as any);
      if (!subcategory) throw new NotFoundException('Subcategory not found or does not belong to the selected category');
    } else {
      delete createJobDto.subcategoryId;
    }


    const country = await this.countryRepository.findOne({ where: { id: createJobDto.countryId } } as any);
    if (!country) throw new NotFoundException('Country not found');



    if (createJobDto.stateId) {
      const state = await this.stateRepository.findOne({ where: { id: createJobDto.stateId, countryId: createJobDto.countryId } } as any);
      if (!state) throw new NotFoundException('State not found or does not belong to the selected country');
    } else {
      delete createJobDto.stateId;
    }


    // Always read latest settings
    const settingsRows = await this.settingRepository.find({ take: 1, order: { created_at: 'DESC' } });
    const latestSetting = settingsRows[0] ?? null;
    const requireApproval = latestSetting?.jobsRequireApproval ?? true;

    // Decide server-side. Never trust client-provided status on create.
    const initialStatus = requireApproval ? JobStatus.PENDING : JobStatus.PUBLISHED;

    // Prevent bypass: strip status if provided
    const { status: _clientStatus, ...cleanDto } = createJobDto as any;

    const job = this.jobRepository.create({
      ...cleanDto,
      buyerId: userId,
      status: initialStatus,
      attachments: cleanDto.attachments?.map((a: any) => ({ ...a, uploadedAt: new Date() })) ?? [],
    });

    const saved: any = await this.jobRepository.save(job);

    if (requireApproval) {
      // notify admins to review
      const admins = await this.userRepository.find({ where: { role: UserRole.ADMIN as any } });
      if (admins.length) {
        const notes = admins.map(a =>
          this.notificationRepository.create({
            userId: a.id,
            type: 'job_review_required',
            title: 'New Job Pending Approval',
            message: `A new job "${saved.title}" is awaiting approval.`,
            relatedEntityType: 'job',
            relatedEntityId: saved.id,
          }),
        );
        await this.notificationRepository.save(notes as any);
      }
    }

    return saved;
  }

  async updateJob(userId: string, jobId: string, status: any) {
    const actor = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.person', 'person')
      .addSelect('person.permissions')
      .where('user.id = :id', { id: userId })
      .getOne();

    const job = await this.jobRepository.findOne({
      where: { id: jobId },
      relations: {
        buyer: {
          person: true
        },
      },
    });
    if (!job) throw new NotFoundException('Job not found');
    const hasPermission = PermissionBitmaskHelper.has(actor.permissions?.jobs, Permissions.Jobs.Edit)

    if (!(actor?.role === UserRole.ADMIN || hasPermission)) {
      if (job.buyerId !== userId) throw new ForbiddenException('You can only update your own jobs');
    }

    job.status = status;
    const notification = this.notificationRepository.create({
      userId: job.buyerId,
      type: 'service_status_update',
      title: 'Service Status Changed',
      message: `The job "${job.title}" status has been updated to "${status}".`,
      relatedEntityType: 'job',
      relatedEntityId: job.id,
    });

    await this.notificationRepository.save(notification);
    return this.jobRepository.save(job);
  }

  async publishJob(jobId: string) {
    const job = await this.jobRepository.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');

    if (job.status === JobStatus.PUBLISHED) return job;
    job.status = JobStatus.PUBLISHED;
    job.closedAt = null;

    const saved = await this.jobRepository.save(job);

    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId: job.buyerId,
        type: 'job_published',
        title: 'Your job is now live',
        message: `Your job "${job.title}" has been approved and published.`,
        relatedEntityType: 'job',
        relatedEntityId: job.id,
      }) as any,
    );

    return saved;
  }

  async deleteJob(userId: string, jobId: string) {
    const job = await this.jobRepository.findOne({
      where: { id: jobId },
      relations: {
        buyer: {
          person: true // Fetches person details for the buyer
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Fetch the user to check their role
    const user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.person', 'person')
      .addSelect('person.permissions')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user) {
      throw new NotFoundException('User not found');
    }
    const hasPermission = PermissionBitmaskHelper.has(user.permissions?.jobs, Permissions.Jobs.Edit)

    // Allow delete if the user is the owner or an admin
    if (!(job.buyerId === userId && user.role === 'admin' || hasPermission)) {
      throw new ForbiddenException('You can only delete your own jobs');
    }

    job.deleted_at = new Date();

    return this.jobRepository.save(job);
  }

  async submitProposal(userId: string, jobId: string, submitProposalDto: any) {
    const job = await this.jobRepository.findOne({ where: { id: jobId, status: JobStatus.PUBLISHED } });
    if (!job) {
      throw new NotFoundException('Job not found or not published');
    }

    const relation = await this.userAccountsRepo.findOne({ where: { mainUserId: job.buyerId, subUserId: userId } })
    if (relation) {
      throw new ConflictException('You cannot submit a proposal  because you’re already linked to this buyer');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingProposal = await this.proposalRepository.findOne({
      where: { jobId, sellerId: userId },
    });

    if (existingProposal) {
      throw new BadRequestException('You have already submitted a proposal for this job');
    }

    const proposal = this.proposalRepository.create({
      ...submitProposalDto,
      jobId,
      sellerId: userId,
      status: ProposalStatus.SUBMITTED,
    });

    const savedProposal: any = await this.proposalRepository.save(proposal);

    const notification = this.notificationRepository.create({
      userId: job.buyerId,
      type: 'new_proposal',
      title: 'New Proposal Received',
      message: `A new proposal has been submitted for your job: ${job.title}`,
      relatedEntityType: 'proposal',
      relatedEntityId: jobId,
    });

    await this.notificationRepository.save(notification);

    return savedProposal;
  }

  async getJobProposals(
    userId: string,
    userRole: string,
    jobId: string,
    page: number = 1,
    search: string = '',
    status: string = '',
    sortBy: string = 'created_at',
    sortdir: 'asc' | 'desc' = 'desc',
    req: any
  ) {
    const job = await this.jobRepository.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');

    const user = req?.user;

    const hasPermission = PermissionBitmaskHelper.has(user?.permissions?.jobs, Permissions.Jobs.Edit)
    // Only admin or job owner can see proposals
    if (!(userRole === UserRole.ADMIN || job.buyerId === userId || hasPermission)) {
      throw new ForbiddenException('Access denied');
    }

    const limit = 20;
    const skip = (page - 1) * limit;

    const qb = this.proposalRepository.createQueryBuilder('proposal')
      .leftJoinAndSelect('proposal.seller', 'seller')
      .leftJoinAndSelect('seller.person', 'person')
      .leftJoinAndSelect('proposal.job', 'job')
      .where('proposal.jobId = :jobId', { jobId });

    // --- Filter by status ---
    if (status) {
      qb.andWhere('proposal.status = :status', { status });
    }

    // --- Search ---
    if (search) {
      qb.andWhere('(person.username ILIKE :search OR person.email ILIKE :search OR proposal.coverLetter ILIKE :search)', { search: `%${search}%` });
    }

    // --- Sorting ---
    const validSortFields = ['created_at', 'bidAmount', 'estimatedTimeDays'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
    const order: 'ASC' | 'DESC' = sortdir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`proposal.${sortField}`, order);

    // Pagination
    qb.skip(skip).take(limit);

    const [proposals, total] = await qb.getManyAndCount();

    return {
      proposals,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  // async updateProposalStatus(userId: string, userRole: string, proposalId: string, status: string) {
  //   const proposal = await this.proposalRepository.findOne({
  //     where: { id: proposalId },
  //     relations: {
  //   job: true,
  //   seller: {
  //     person: true // Joins the Person table to get username, email, etc.
  //   }
  // }
  //   });

  //   if (!proposal) {
  //     throw new NotFoundException('Proposal not found');
  //   }

  //   if (userRole !== UserRole.ADMIN && proposal.job.buyerId !== userId) {
  //     throw new ForbiddenException('Access denied');
  //   }

  //   proposal.status = status as ProposalStatus;
  //   const savedProposal = await this.proposalRepository.save(proposal);

  //   if (proposal.sellerId !== userId) {
  //     const notification = this.notificationRepository.create({
  //       userId: proposal.sellerId,
  //       type: 'proposal_status_update',
  //       title: 'Proposal Status Updated',
  //       message: `Your proposal for job "${proposal.job.title}" has been ${status}`,
  //       relatedEntityType: 'proposal',
  //       relatedEntityId: proposalId,
  //     } as any);

  //     await this.notificationRepository.save(notification);
  //   }

  //   // If proposal is accepted, create an order
  //   if (status === ProposalStatus.ACCEPTED) {
  //     await this.createOrderFromProposal(proposal);
  //   }

  //   return savedProposal;
  // }

  async updateProposalStatusAtomic(userId: string, userRole: string, proposalId: string, status: any, opts?: any) {
    return await this.dataSource.transaction(async manager => {
      const proposalRepo = manager.getRepository(Proposal);
      const jobRepo = manager.getRepository(Job);
      const orderRepo = manager.getRepository(Order);
      const invoiceRepo = manager.getRepository(Invoice);
      const settingRepo = manager.getRepository(Setting);
      const proposal = await proposalRepo.findOne({
        where: { id: proposalId },
      });
      if (!proposal) throw new NotFoundException('Proposal not found');

      const job = await jobRepo.findOne({
        where: { id: proposal.jobId },
      });
      if (!job) throw new NotFoundException('Job not found');

      if (userRole !== UserRole.ADMIN && job.buyerId !== userId) {
        throw new ForbiddenException('Access denied');
      }
      // notification repository within transaction
      const notifRepo = manager.getRepository(Notification);

      // Helper to create & save a notification for seller
      const notifySeller = async (message: string, type = 'proposal_status_update') => {
        try {
          const n = notifRepo.create({
            userId: proposal.sellerId,
            type,
            title: 'Proposal Status Updated',
            message,
          } as any);
          await notifRepo.save(n as any);
        } catch (err) {
          // don't fail the whole transaction for notification problems
        }
      };

      const s = await settingRepo.find({ take: 1, order: { created_at: 'DESC' } });
      const platformPercent = Number(s?.[0]?.platformPercent ?? 10);
      const sellerServiceFee = Number(s?.[0]?.sellerServiceFee ?? 10);
      // ===============================
      // CASE 1: REJECT
      // ===============================
      if (status === ProposalStatus.REJECTED) {
        proposal.status = ProposalStatus.REJECTED;
        await proposalRepo.save(proposal);
        await notifySeller(`Your proposal for job "${job.title}" has been rejected.`);
        return { proposalId, status: ProposalStatus.REJECTED };
      }

      // ===============================
      // CASE 2: ACCEPT (with checkout)
      // ===============================
      if (status === ProposalStatus.ACCEPTED && opts?.checkout) {
        let order: any = await orderRepo.findOne({
          where: { jobId: job.id, proposalId: proposal.id },
        });

        if (!order) {
          order = orderRepo.create({
            buyerId: job.buyerId,
            sellerId: proposal.sellerId,
            jobId: job.id,
            proposalId: proposal.id,
            title: job.title,
            quantity: 1,
            totalAmount: Number(proposal.bidAmount + platformPercent),
            sellerServiceFee: sellerServiceFee,
            packageType: PackageType.BASIC,
            status: OrderStatus.PENDING,
            orderDate: new Date(),
            deliveryTime: proposal.estimatedTimeDays,
          } as any);
          await orderRepo.save(order);
        }

        // ensure invoice
        let inv: any = await invoiceRepo.findOne({
          where: { orderId: order.id },
        });
        if (!inv) {
          const totalAmount = order.totalAmount;
          const subtotal = proposal.bidAmount;

          inv = invoiceRepo.create({
            invoiceNumber: `INV-${Date.now()}-${order.id.slice(-6)}`,
            orderId: order.id,
            subtotal,
            sellerServiceFee: order.sellerServiceFee,
            platformPercent,
            totalAmount,
            currencyId: 'SAR',
            paymentStatus: PaymentStatus.PENDING,
            issuedAt: new Date(),
          } as any);
          await invoiceRepo.save(inv);
        }

        if (proposal.status !== ProposalStatus.ACCEPTED) {
          proposal.status = ProposalStatus.ACCEPTED;
          await proposalRepo.save(proposal);
        }

        await notifySeller(`Your proposal for job "${job.title}" has been accepted. An order was created.`);

        // return checkout payload for frontend
        const checkoutPayload = {
          orderId: order.id,
          redirectUrl: `/payment?orderId=${order.id}`,
          successUrl: opts.checkout.successUrl,
          cancelUrl: opts.checkout.cancelUrl,
        };

        return { __checkout__: checkoutPayload };
      }

      // ===============================
      // CASE 3: Generic status update
      // ===============================
      if (Object.values(ProposalStatus).includes(status)) {
        proposal.status = status as ProposalStatus;
        await proposalRepo.save(proposal);
        await notifySeller(`Your proposal for job "${job.title}" status has been updated to: ${status}.`);
        return { proposalId, status };
      }

      throw new BadRequestException('Invalid status update');
    });
  }

  async getUserProposals(userId: string, status?: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    console.log('HERE');

    const whereClause: any = { sellerId: userId };
    if (status) {
      whereClause.status = status;
    }

    const [proposals, total] = await this.proposalRepository.findAndCount({
      where: whereClause,
      relations: {
        job: {
          buyer: {
            person: true // Fetches the profile details (name, avatar, etc.)
          }
        }
      },
      order: { submittedAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      proposals,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  private async createOrderFromProposal(proposal: Proposal) {
    const order = this.orderRepository.create({
      buyerId: proposal.job.buyerId,
      sellerId: proposal.sellerId,
      jobId: proposal.jobId,
      proposalId: proposal.id,
      title: proposal.job.title,
      quantity: 1,
      totalAmount: proposal.bidAmount,
      packageType: 'Basic', // Since it's a custom job proposal
      status: OrderStatus.PENDING,
      orderDate: new Date(),
    } as any);

    const savedOrder: any = await this.orderRepository.save(order);

    // Update job status to awarded
    proposal.job.status = JobStatus.AWARDED;
    await this.jobRepository.save(proposal.job);

    // Notify both parties about order creation
    const buyerNotification = this.notificationRepository.create({
      userId: proposal.job.buyerId,
      type: 'order_created',
      title: 'Order Created from Proposal',
      message: `An order has been created from your accepted proposal for job: ${proposal.job.title}`,
      relatedEntityType: 'order',
      relatedEntityId: savedOrder.id,
    });

    const sellerNotification = this.notificationRepository.create({
      userId: proposal.sellerId,
      type: 'order_created',
      title: 'Order Created from Proposal',
      message: `An order has been created from your accepted proposal for job: ${proposal.job.title}`,
      relatedEntityType: 'order',
      relatedEntityId: savedOrder.id,
    } as any);

    await this.notificationRepository.save(sellerNotification);
    await this.notificationRepository.save(buyerNotification);

    return savedOrder;
  }

  async getJobStats(userId: string) {
    const totalJobs = await this.jobRepository.count({ where: { buyerId: userId } });
    const publishedJobs = await this.jobRepository.count({ where: { buyerId: userId, status: JobStatus.PUBLISHED } });
    const awardedJobs = await this.jobRepository.count({ where: { buyerId: userId, status: JobStatus.AWARDED } });
    const completedJobs = await this.jobRepository.count({ where: { buyerId: userId, status: JobStatus.COMPLETED } });

    const totalProposals = await this.proposalRepository.createQueryBuilder('proposal').innerJoin('proposal.job', 'job').where('job.buyerId = :userId', { userId }).getCount();

    return {
      totalJobs,
      publishedJobs,
      awardedJobs,
      completedJobs,
      totalProposals,
    };
  }
}
