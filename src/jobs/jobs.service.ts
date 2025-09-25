import { Injectable, NotFoundException, ForbiddenException, BadRequestException, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In, Between, MoreThanOrEqual, LessThanOrEqual, DataSource } from 'typeorm';
import { Job, Proposal, User, Category, Order, Notification, JobStatus, ProposalStatus, UserRole, OrderStatus, Setting, PaymentStatus, PackageType, Invoice } from 'entities/global.entity';
import { CreateJobDto } from 'dto/job.dto';
import { PaymentsService } from 'src/payments/payments.service';

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
    @InjectRepository(Order)
    public orderRepository: Repository<Order>,
    @InjectRepository(Notification)
    public notificationRepository: Repository<Notification>,
    @InjectRepository(Setting)
    public settingRepository: Repository<Setting>,
    @InjectRepository(Invoice)
    public invoiceRepo: Repository<Invoice>,
    private readonly dataSource: DataSource,

    @Inject(forwardRef(() => PaymentsService))
    public readonly paymentsService: PaymentsService,
  ) {}

  async getJobs(query: any) {
    const { page = 1, limit = 20, category, subcategory, minBudget, maxBudget, budgetType, status = 'published' } = query;

    const skip = (page - 1) * limit;
    const whereClause: any = { status };

    if (category) whereClause.categoryId = category;
    if (subcategory) whereClause.subcategoryId = subcategory;
    if (budgetType) whereClause.budgetType = budgetType;
    if (minBudget || maxBudget) {
      whereClause.budget = Between(minBudget || 0, maxBudget || 999999);
    }

    const [jobs, total] = await this.jobRepository.findAndCount({
      where: whereClause,
      relations: ['buyer', 'category', 'subcategory', 'proposals'],
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

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

  async searchJobs(query: any) {
    const { q, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const [jobs, total] = await this.jobRepository.findAndCount({
      where: [
        { title: Like(`%${q}%`), status: 'published' },
        { description: Like(`%${q}%`), status: 'published' },
        { skillsRequired: In([q]), status: 'published' },
      ],
      relations: ['buyer', 'category'],
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

  async getJob(jobId: string) {
    const job = await this.jobRepository.findOne({
      where: { id: jobId },
      relations: ['buyer', 'category', 'subcategory', 'proposals', 'proposals.seller'],
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return job;
  }

  async createJob(userId: string, createJobDto: CreateJobDto) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (createJobDto.categoryId) {
      const category = await this.categoryRepository.findOne({ where: { id: createJobDto.categoryId } } as any);
      if (!category) throw new NotFoundException('Category not found');
    }

    if (createJobDto.subcategoryId) {
      const subcategory = await this.categoryRepository.findOne({ where: { id: createJobDto.subcategoryId } } as any);
      if (!subcategory) throw new NotFoundException('Subcategory not found or does not belong to the selected category');
    } else {
      delete createJobDto.subcategoryId;
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

  async updateJob(userId: string, jobId: string, updateJobDto: any) {
    const actor = await this.userRepository.findOne({ where: { id: userId } });

    const job = await this.jobRepository.findOne({
      where: { id: jobId },
      relations: ['buyer'],
    });
    if (!job) throw new NotFoundException('Job not found');
    if (actor?.role != UserRole.ADMIN) {
      if (job.buyerId !== userId) throw new ForbiddenException('You can only update your own jobs');
    }

    const settingsRows = await this.settingRepository.find({ take: 1, order: { created_at: 'DESC' } });
    const requireApproval = (settingsRows[0]?.jobsRequireApproval ?? true) === true;

    if (requireApproval && actor?.role !== UserRole.ADMIN && typeof updateJobDto?.status !== 'undefined') {
      throw new ForbiddenException('Only administrators can change job status when approval is required.');
    }

    const {
      id: _id,
      buyerId: _buyerId,
      created_at: _c,
      updated_at: _u, // blocked
      ...cleanDto
    } = updateJobDto ?? {};

    // (Optional) validate category/subcategory if present, etc.

    Object.assign(job, cleanDto);
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
      relations: ['buyer'],
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.buyerId !== userId) {
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

  async getJobProposals(userId: string, userRole: string, jobId: string, page: number = 1) {
    const job = await this.jobRepository.findOne({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Check permissions: only job owner or admin can view proposals
    if (userRole !== UserRole.ADMIN && job.buyerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const limit = 20;
    const skip = (page - 1) * limit;

    const [proposals, total] = await this.proposalRepository.findAndCount({
      where: { jobId },
      relations: ['seller', 'job'],
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

  // async updateProposalStatus(userId: string, userRole: string, proposalId: string, status: string) {
  //   const proposal = await this.proposalRepository.findOne({
  //     where: { id: proposalId },
  //     relations: ['job', 'seller'],
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
        lock: { mode: 'pessimistic_write' },
      });
      if (!proposal) throw new NotFoundException('Proposal not found');

      const job = await jobRepo.findOne({
        where: { id: proposal.jobId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!job) throw new NotFoundException('Job not found');

      if (userRole !== UserRole.ADMIN && job.buyerId !== userId) {
        throw new ForbiddenException('Access denied');
      }

      // ===============================
      // CASE 1: REJECT
      // ===============================
      if (status === ProposalStatus.REJECTED) {
        proposal.status = ProposalStatus.REJECTED;
        await proposalRepo.save(proposal);
        return { proposalId, status: ProposalStatus.REJECTED };
      }

      // ===============================
      // CASE 2: ACCEPT (with checkout)
      // ===============================
      if (status === ProposalStatus.ACCEPTED && opts?.checkout) {
        let order: any = await orderRepo.findOne({
          where: { jobId: job.id, proposalId: proposal.id },
          lock: { mode: 'pessimistic_write' },
        });

        if (!order) {
          order = orderRepo.create({
            buyerId: job.buyerId,
            sellerId: proposal.sellerId,
            jobId: job.id,
            proposalId: proposal.id,
            title: job.title,
            quantity: 1,
            totalAmount: Number(proposal.bidAmount),
            packageType: PackageType.BASIC,
            status: OrderStatus.PENDING,
            orderDate: new Date(),
          } as any);
          await orderRepo.save(order);
        }

        // ensure invoice
        let inv: any = await invoiceRepo.findOne({
          where: { orderId: order.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!inv) {
          const s = await settingRepo.find({ take: 1, order: { created_at: 'DESC' } });
          const platformPercent = Number(s?.[0]?.platformPercent ?? 10);
          const totalAmount = Number(order.totalAmount);
          const serviceFee = +(totalAmount * (platformPercent / 100)).toFixed(2);
          const subtotal = +(totalAmount - serviceFee).toFixed(2);

          inv = invoiceRepo.create({
            invoiceNumber: `INV-${Date.now()}-${order.id.slice(-6)}`,
            orderId: order.id,
            subtotal,
            serviceFee,
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

        // return fake checkout link for frontend
        const checkoutPayload = {
          orderId: order.id,
          redirectUrl: `/payment?orderId=${order.id}`,
          successUrl: opts.checkout.successUrl,
          cancelUrl: opts.checkout.cancelUrl,
        };

        return { __checkout__: checkoutPayload };
      }

      throw new BadRequestException('Invalid status update');
    });
  }

  async getUserProposals(userId: string, status?: string, page: number = 1) {
    const limit = 20;
    const skip = (page - 1) * limit;
    console.log('HERE');

    const whereClause: any = { sellerId: userId };
    if (status) {
      whereClause.status = status;
    }

    const [proposals, total] = await this.proposalRepository.findAndCount({
      where: whereClause,
      relations: ['job', 'job.buyer'],
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
