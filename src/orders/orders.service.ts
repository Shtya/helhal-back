import { Injectable, NotFoundException, ForbiddenException, BadRequestException, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';
import { Order, Service, User, Invoice, Payment, OrderStatus, UserRole, PaymentStatus, Job, Proposal, Setting, ProposalStatus, JobStatus, Notification, Wallet, Dispute, DisputeStatus, OrderSubmission, OrderChangeRequest } from 'entities/global.entity';
import { AccountingService } from 'src/accounting/accounting.service';
import { randomBytes } from 'crypto';
import { CRUD } from 'common/crud.service';


@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    public orderRepository: Repository<Order>,
    @InjectRepository(OrderSubmission)
    public submissionRepo: Repository<OrderSubmission>,
    @InjectRepository(OrderChangeRequest)
    public changeRepo: Repository<OrderChangeRequest>,
    @InjectRepository(Service)
    public serviceRepository: Repository<Service>,
    @InjectRepository(User)
    public userRepository: Repository<User>,
    @InjectRepository(Invoice)
    public invoiceRepository: Repository<Invoice>,
    @InjectRepository(Payment)
    public paymentRepository: Repository<Payment>,

    private readonly dataSource: DataSource,
    private readonly accountingService: AccountingService,

    @InjectRepository(Job) private jobRepo: Repository<Job>,
    @InjectRepository(Proposal) private proposalRepo: Repository<Proposal>,
    @InjectRepository(Notification) private notifRepo: Repository<Notification>,
    @InjectRepository(Setting) private settingRepo: Repository<Setting>,
    @InjectRepository(Dispute) private disputeRepo: Repository<Dispute>,
  ) { }

  Submission
  SUBMISSIO_AFTER_DAYS = 14;
  async getOrdersForUser(userId: string, query: any) {
    const { search, page = 1, limit = 10, sortBy = 'created_at', sortOrder = 'DESC', status } = query;

    // Fetch user role
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const qb = this.orderRepository.createQueryBuilder('order')
      .leftJoinAndSelect('order.service', 'service')
      .leftJoinAndSelect('order.buyer', 'buyer')
      .leftJoinAndSelect('order.seller', 'seller')
      .leftJoinAndSelect('order.disputes', 'disputes');

    // Role-based filtering
    if (user.role === UserRole.BUYER)
      qb.andWhere('order.buyerId = :userId', { userId });
    else
      qb.andWhere('order.sellerId = :userId', { userId });



    // Status filtering
    if (status && status !== 'all') {
      if (status === 'Active') {
        qb.andWhere('order.status IN (:...activeStatuses)', { activeStatuses: ['Pending', 'Accepted'] });
      } else {
        qb.andWhere('order.status = :status', { status });
      }
    }

    // Search
    if (search) {
      qb.andWhere('order.title ILIKE :search', { search: `%${search}%` });
    }

    // Sorting
    const validSortFields = ['created_at', 'totalAmount', 'dueDate', 'orderDate'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
    const orderDir: 'ASC' | 'DESC' = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`order.${sortField}`, orderDir);

    // Pagination
    const pageNumber = Number(page) || 1;
    const limitNumber = Number(limit) || 10;
    const skip = (pageNumber - 1) * limitNumber;
    qb.skip(skip).take(limitNumber);

    // Execute query
    const [orders, total] = await qb.getManyAndCount();

    // Add disputeId for first active dispute
    const records = orders.map(order => {
      const activeDispute = order.disputes?.find(d =>
        [DisputeStatus.OPEN, DisputeStatus.IN_REVIEW].includes(d.status)
      );

      return {
        ...order,
        disputeId: activeDispute?.id ?? null
      };
    });

    return {
      total_records: total,
      current_page: pageNumber,
      per_page: limitNumber,
      records
    };
  }




  async markOrderPaid(orderId: string, userId: string) {
    // 1) Commit the authoritative payment state in a single tx
    const result = await this.dataSource.transaction(async manager => {
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        relations: ['invoices'],
      });
      if (!order) throw new NotFoundException('Order not found');

      // Only buyer (or admin) can mark it as paid
      if (order.buyerId !== userId) throw new ForbiddenException();

      // Mark invoice as paid
      const invoice = order.invoices?.[0];
      if (!invoice) throw new NotFoundException('Invoice not found');

      invoice.paymentStatus = PaymentStatus.PAID; // 'paid'
      invoice.paymentMethod = 'wallet';
      invoice.transactionId = `TX-${Date.now()}`;
      await manager.save(invoice);

      // Update order status
      order.status = OrderStatus.ACCEPTED;
      order.completedAt = new Date(); // keep your original behavior
      await manager.save(order);

      // Buyer & Seller notifications inside TX (guaranteed with payment state)
      const amount = Number(invoice.totalAmount ?? order.totalAmount);
      const currency = 'SAR';
      const txId = invoice.transactionId ?? '';
      const notifRepo = manager.getRepository(Notification);

      // ✅ Increment service order count
      if (order.serviceId) {
        await manager
          .createQueryBuilder()
          .update(Service)
          .set({ ordersCount: () => `"orders_count" + 1` })
          .where('id = :id', { id: order.serviceId })
          .execute();
      }

      const buyerNotif = notifRepo.create({
        userId: order.buyerId,
        type: 'payment',
        title: 'Payment Successful',
        message: `Your payment of ${amount} ${currency} for “${order.title}” was processed successfully. Transaction: ${txId}.`,
        relatedEntityType: 'order',
        relatedEntityId: order.id,
      });

      const sellerNotif = notifRepo.create({
        userId: order.sellerId,
        type: 'payment',
        title: 'Order Paid',
        message: `The order “${order.title}” has been paid (${amount} ${currency}). Transaction: ${txId}.`,
        relatedEntityType: 'order',
        relatedEntityId: order.id,
      });

      await notifRepo.save([buyerNotif, sellerNotif]);

      return {
        orderId: order.id,
        status: order.status,
        invoiceId: invoice.id,
        amount,
        currency,
        txId,
        orderTitle: order.title,
      };
    });

    await this.accountingService.holdEscrow(result.orderId);

    return result;
  }

  async getUserOrders(userId: string, userRole: string, status?: string, page: number = 1) {
    const limit = 20;
    console.log(page, limit);
    const skip = (page || 1 - 1) * limit;

    const whereClause: any = {};

    if (userRole === UserRole.BUYER) {
      whereClause.buyerId = userId;
    } else if (userRole === UserRole.SELLER) {
      whereClause.sellerId = userId;
    }

    if (status) {
      whereClause.status = status;
    }

    const [orders, total] = await this.orderRepository.findAndCount({
      where: whereClause,
      relations: ['service', 'buyer', 'seller'],
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getOrder(userId: string, userRole: string, orderId: string) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['service', 'buyer', 'seller', 'invoices', 'invoices.payments'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Check if user has access to this order
    if (userRole === UserRole.BUYER && order.buyerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (userRole === UserRole.SELLER && order.sellerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return order;
  }

  async createOrderCheckout(userId: string, createOrderDto: any) {
    const { serviceId, packageType, quantity, requirementsAnswers, notes } = createOrderDto;

    const service = await this.serviceRepository.findOne({ where: { id: serviceId, status: 'Active' } } as any);
    if (!service) throw new NotFoundException('Service not found or not available');

    const seller = await this.userRepository.findOne({ where: { id: service.sellerId } });
    if (!seller) throw new NotFoundException('Seller not found');

    const packageData = service.packages.find((pkg: any) => pkg.type === packageType);
    if (!packageData) throw new BadRequestException('Invalid package type');

    const totalAmount = packageData.price * quantity;

    const order = this.orderRepository.create({
      buyerId: userId,
      sellerId: service.sellerId,
      serviceId,
      title: service.title,
      quantity,
      totalAmount,
      packageType,
      requirementsAnswers,
      status: OrderStatus.PENDING, // waiting for payment
      orderDate: new Date(),
      deliveryTime: packageData.deliveryTime,
      notes: notes
    });

    const savedOrder = await this.orderRepository.save(order);

    // ---- Invoice
    const platformPercent = 10;
    const serviceFee = (totalAmount * platformPercent) / 100;
    const subtotal = totalAmount - serviceFee;

    const checkoutToken = randomBytes(16).toString('hex');

    const invoice = this.invoiceRepository.create({
      invoiceNumber: `INV-${Date.now()}-${savedOrder.id.slice(-6)}`,
      orderId: savedOrder.id,
      order: savedOrder,
      subtotal,
      serviceFee,
      platformPercent,
      totalAmount,
      issuedAt: new Date(),
      paymentStatus: PaymentStatus.PENDING,
    });

    await this.invoiceRepository.save(invoice);

    const paymentUrl = `http://localhost:3000/payment?orderId=${savedOrder.id}&invoice=${invoice.invoiceNumber}&token=${checkoutToken}`;

    // Return order + simulated checkout link
    return {
      order: savedOrder,
      paymentUrl,
    };
  }

  async createOrder(userId: string, createOrderDto: any) {
    const { serviceId, packageType, quantity, requirementsAnswers } = createOrderDto;

    const service = await this.serviceRepository.findOne({
      where: { id: serviceId, status: 'Active' },
    } as any);

    if (!service) {
      throw new NotFoundException('Service not found or not available');
    }

    const seller = await this.userRepository.findOne({
      where: { id: service.sellerId },
    });

    if (!seller) {
      throw new NotFoundException('Seller not found');
    }

    // Calculate total amount based on package type
    const packageData = service.packages.find((pkg: any) => pkg.type === packageType);
    if (!packageData) {
      throw new BadRequestException('Invalid package type');
    }

    const totalAmount = packageData.price * quantity;

    const order = this.orderRepository.create({
      buyerId: userId,
      sellerId: service.sellerId,
      serviceId,
      title: service.title,
      quantity,
      totalAmount,
      packageType,
      requirementsAnswers,
      status: OrderStatus.PENDING,
      orderDate: new Date(),
      deliveryTime: packageData.deliveryTime,
    });

    const savedOrder = await this.orderRepository.save(order);

    // Create invoice
    const platformPercent = 10;
    const serviceFee = (totalAmount * platformPercent) / 100;
    const subtotal = totalAmount - serviceFee;

    const invoice = this.invoiceRepository.create({
      invoiceNumber: `INV-${Date.now()}-${savedOrder.id.slice(-6)}`,
      orderId: savedOrder.id,
      subtotal,
      serviceFee,
      platformPercent,
      totalAmount,
      issuedAt: new Date(),
      paymentStatus: PaymentStatus.PENDING,
    });

    await this.invoiceRepository.save(invoice);

    return savedOrder;
  }

  private async updateSellerStats(order: Order) {
    const seller = await this.userRepository.findOne({ where: { id: order.sellerId } });
    if (!seller) return;

    // Increase completed orders
    seller.ordersCompleted = (seller.ordersCompleted || 0) + 1;

    // Check if this buyer is first-time
    const previousOrders = await this.orderRepository.count({
      where: {
        sellerId: seller.id,
        buyerId: order.buyerId,
        status: OrderStatus.COMPLETED,
        id: Not(order.id), // exclude current order
      },
    });

    if (previousOrders === 0) {
      seller.repeatBuyers = (seller.repeatBuyers || 0) + 1;
    }

    await this.userRepository.save(seller);
  }


  async updateOrderStatus(userId: string, userRole: string, orderId: string, status: string) {
    const order = await this.getOrder(userId, userRole, orderId);

    // Validate status transition
    const validTransitions = {
      [OrderStatus.PENDING]: [OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
      [OrderStatus.ACCEPTED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
      [OrderStatus.DELIVERED]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
    };

    if (!validTransitions[order.status]?.includes(status as OrderStatus)) {
      throw new BadRequestException('Invalid status transition');
    }

    // Check permissions
    if (userRole === UserRole.BUYER && status !== OrderStatus.CANCELLED) {
      throw new ForbiddenException('Buyers can only cancel orders');
    }

    if (userRole === UserRole.SELLER && status === OrderStatus.CANCELLED) {
      throw new ForbiddenException('Sellers cannot cancel orders directly');
    }

    order.status = status as OrderStatus;

    // Set timestamps
    if (status === OrderStatus.ACCEPTED) {
      order.dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    } else if (status === OrderStatus.DELIVERED) {
      order.deliveredAt = new Date();
    } else if (status === OrderStatus.COMPLETED) {
      {
        order.completedAt = new Date();
        await this.updateSellerStats(order);
      }
    } else if (status === OrderStatus.CANCELLED) {
      order.cancelledAt = new Date();
    }

    return this.orderRepository.save(order);
  }

  async deliverOrder(
    userId: string,
    orderId: string,
    submissionData: { message?: string; files?: { filename: string; url: string }[] },
  ) {
    const order = await this.getOrder(userId, UserRole.SELLER, orderId);

    if (order.status !== OrderStatus.ACCEPTED && order.status !== OrderStatus.ChangeRequested) {
      throw new BadRequestException('Order must be accepted before delivery');
    }

    // Block if dispute exists
    const hasDispute = await this.disputeRepo.exist({
      where: { orderId, status: In([DisputeStatus.OPEN, DisputeStatus.IN_REVIEW]) as any },
    });
    if (hasDispute) throw new BadRequestException('Order is in dispute');


    // --- Add submission ---
    const submission = this.submissionRepo.create({
      orderId,
      sellerId: userId,
      message: submissionData.message || null,
      files: submissionData.files || [],
    });
    await this.submissionRepo.save(submission);

    order.submissionDate = new Date();
    order.deliveryTime = this.SUBMISSIO_AFTER_DAYS;
    // timeline
    order.timeline = [
      ...(order.timeline || []),
      {
        type: 'delivered',
        at: new Date().toISOString(),
        by: 'seller',
      },
    ];

    order.status = OrderStatus.DELIVERED;
    order.deliveredAt = new Date();
    const saved = await this.orderRepository.save(order);

    // 🔔 notify buyer
    await this.notifRepo.save(
      this.notifRepo.create({
        userId: order.buyerId,
        type: 'order_delivered',
        title: 'Order delivered',
        message: `The seller delivered "${order.title}". Please review and confirm receipt.`,
        relatedEntityType: 'order',
        relatedEntityId: order.id,
      }) as any,
    );

    return saved;
  }

  async getLastSubmission(userId: string, orderId: string) {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    // Only the seller (freelancer) or buyer can see submissions
    const submissions = await this.submissionRepo.findOne({
      where: { orderId },
      order: { created_at: 'DESC' },
    });

    const lastSubmission = submissions ?? null;

    return lastSubmission;
  }

  async changeRequest(userId: string, orderId: string) {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    // Only the seller (freelancer) or buyer can see submissions
    const changeRequest = await this.changeRepo.findOne({
      where: { orderId },
      order: { created_at: 'DESC' },
    });

    const lastChangeRequest = changeRequest ?? null;

    return lastChangeRequest;
  }


  async createChangeRequest(
    userId: string,
    orderId: string,
    changeData: { message?: string; files?: { filename: string; url: string }[]; newDeliveryTime?: number },
  ) {
    // Fetch order
    const order = await this.getOrder(userId, UserRole.BUYER, orderId);

    if (![OrderStatus.DELIVERED].includes(order.status)) {
      throw new BadRequestException('Cannot request changes for this order at its current status');
    }

    // Create OrderChangeRequest
    const changeRequest = this.changeRepo.create({
      orderId,
      buyerId: userId,
      message: changeData.message || null,
      files: changeData.files || [],
    });

    await this.changeRepo.save(changeRequest);

    // Update order
    order.status = OrderStatus.ChangeRequested;
    order.deliveryTime = 14;
    order.submissionDate = new Date();

    // Update timeline
    order.timeline = [
      ...(order.timeline || []),
      {
        type: 'change_requested',
        at: new Date().toISOString(),
        by: 'buyer',
        message: changeData.message || null,
      },
    ];

    const savedOrder = await this.orderRepository.save(order);

    // Notify seller
    await this.notifRepo.save(
      this.notifRepo.create({
        userId: order.sellerId,
        type: 'order_change_requested',
        title: `Change requested for "${order.title}"`,
        message: changeData.message || 'Buyer requested changes',
        relatedEntityType: 'order',
        relatedEntityId: order.id,
      }) as any,
    );

    return {
      order: savedOrder,
      changeRequest,
    };
  }


  async cancelOrder(userId: string, userRole: string, orderId: string, reason?: string) {
    const order = await this.getOrder(userId, userRole, orderId);

    // Only the buyer can cancel the order
    if (order.buyerId !== userId) {
      throw new ForbiddenException('Only the buyer can cancel this order');
    }


    if (![OrderStatus.PENDING, OrderStatus.ACCEPTED].includes(order.status)) {
      throw new BadRequestException('Order cannot be cancelled at this stage');
    }

    order.status = OrderStatus.CANCELLED;
    order.cancelledAt = new Date();

    // timeline
    order.timeline = [
      ...(order.timeline || []),
      {
        type: 'canceled',
        at: new Date().toISOString(),
        by: 'buyer',
      },
    ];

    // Process refund if payment was made
    const invoice = await this.invoiceRepository.findOne({
      where: { orderId },
    });

    if (invoice && invoice.paymentStatus === PaymentStatus.PAID) {
      // Process refund (implement your refund logic here)
      invoice.paymentStatus = PaymentStatus.FAILED; // Mark as refunded
      await this.invoiceRepository.save(invoice);
    }

    return this.orderRepository.save(order);
  }

  async autoCancel(orderId: string) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['service', 'buyer', 'seller', 'invoices', 'invoices.payments'],
    });

    if (![OrderStatus.ChangeRequested].includes(order.status)) {
      throw new BadRequestException('Order cannot be cancelled at this stage');
    }

    order.status = OrderStatus.CANCELLED;
    order.cancelledAt = new Date();

    // timeline
    order.timeline = [
      ...(order.timeline || []),
      {
        type: 'canceled',
        at: new Date().toISOString(),
        by: 'automatically',
      },
    ];

    // Process refund if payment was made
    const invoice = await this.invoiceRepository.findOne({
      where: { orderId },
    });

    if (invoice && invoice.paymentStatus === PaymentStatus.PAID) {
      // Process refund (implement your refund logic here)
      invoice.paymentStatus = PaymentStatus.FAILED; // Mark as refunded
      await this.invoiceRepository.save(invoice);
    }

    return this.orderRepository.save(order);
  }

  async autoComplete(orderId: string) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['service', 'buyer', 'seller', 'invoices', 'invoices.payments'],
    });
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('Order must be delivered before completion');
    }

    // Block if dispute exists
    const hasDispute = await this.disputeRepo.exist({
      where: { orderId, status: In([DisputeStatus.OPEN, DisputeStatus.IN_REVIEW]) as any },
    });
    if (hasDispute) throw new BadRequestException('Order is in dispute; completion is blocked');

    // timeline
    order.timeline = [
      ...(order.timeline || []),
      {
        type: 'completed',
        at: new Date().toISOString(),
        by: 'automatically',
      },
    ];

    order.status = OrderStatus.COMPLETED;
    order.completedAt = new Date();
    const saved = await this.orderRepository.save(order);

    await this.accountingService.releaseEscrow(orderId); // subtotal → seller

    // Update seller stats
    await this.updateSellerStats(order);

    // 🔔 notify seller
    await this.notifRepo.save(
      this.notifRepo.create({
        userId: order.sellerId,
        type: 'order_completed',
        title: 'Order completed',
        message: `The buyer confirmed completion for "${order.title}". Payout is now available.`,
        relatedEntityType: 'order',
        relatedEntityId: order.id,
      }) as any,
    );

    return saved;
  }

  // called by PaymentsService.confirmPayment
  async finalizeOrderFromProposalPayment(orderId: string) {
    await this.dataSource.transaction(async m => {
      const order = await m.getRepository(Order).findOne({
        where: { id: orderId },
        relations: ['proposal', 'job'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!order?.proposal || !order?.job) throw new NotFoundException('Order context invalid');

      const proposalRepo = m.getRepository(Proposal);
      const jobRepo = m.getRepository(Job);
      const notifRepo = m.getRepository(Notification);

      const job = order.job;
      const acceptedProposal = await proposalRepo.findOne({
        where: { id: order.proposalId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!acceptedProposal) throw new NotFoundException('Proposal not found');

      // accept this proposal
      acceptedProposal.status = ProposalStatus.ACCEPTED;
      await proposalRepo.save(acceptedProposal);

      // reject others
      const others = await proposalRepo.find({ where: { jobId: job.id } });
      const toReject = others.filter(p => p.id !== acceptedProposal.id && p.status !== ProposalStatus.REJECTED);
      if (toReject.length) {
        await proposalRepo
          .createQueryBuilder()
          .update(Proposal)
          .set({ status: ProposalStatus.REJECTED })
          .where({ id: In(toReject.map(p => p.id)) })
          .execute();

        const notifs: any = toReject.map(p =>
          notifRepo.create({
            userId: p.sellerId,
            type: 'proposal_status_update',
            title: 'Proposal Rejected',
            message: `Another proposal was accepted for job "${job.title}".`,
            relatedEntityType: 'proposal',
            relatedEntityId: p.id,
          } as any),
        );
        if (notifs.length) await notifRepo.save(notifs);
      }

      // job → awarded
      job.status = JobStatus.AWARDED;
      job.closedAt = null;
      await jobRepo.save(job);

      // notify buyer and winner
      await notifRepo.save(
        notifRepo.create({
          userId: job.buyerId,
          type: 'order_created',
          title: 'Order Activated',
          message: `Payment received. Order for "${job.title}" is now active.`,
          relatedEntityType: 'order',
          relatedEntityId: order.id,
        }) as any,
      );

      await notifRepo.save(
        notifRepo.create({
          userId: acceptedProposal.sellerId,
          type: 'proposal_status_update',
          title: 'Proposal Accepted',
          message: `Your proposal for "${job.title}" was accepted and paid.`,
          relatedEntityType: 'proposal',
          relatedEntityId: acceptedProposal.id,
        }) as any,
      );
    });
  }

  async completeOrder(userId: string, orderId: string) {
    const order = await this.getOrder(userId, UserRole.BUYER, orderId);
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('Order must be delivered before completion');
    }

    // Block if dispute exists
    const hasDispute = await this.disputeRepo.exist({
      where: { orderId, status: In([DisputeStatus.OPEN, DisputeStatus.IN_REVIEW]) as any },
    });
    if (hasDispute) throw new BadRequestException('Order is in dispute; completion is blocked');

    // timeline
    order.timeline = [
      ...(order.timeline || []),
      {
        type: 'completed',
        at: new Date().toISOString(),
        by: 'buyer',
      },
    ];

    order.status = OrderStatus.COMPLETED;
    order.completedAt = new Date();
    const saved = await this.orderRepository.save(order);

    await this.accountingService.releaseEscrow(orderId); // subtotal → seller

    // Update seller stats
    await this.updateSellerStats(order);

    // 🔔 notify seller
    await this.notifRepo.save(
      this.notifRepo.create({
        userId: order.sellerId,
        type: 'order_completed',
        title: 'Order completed',
        message: `The buyer confirmed completion for "${order.title}". Payout is now available.`,
        relatedEntityType: 'order',
        relatedEntityId: order.id,
      }) as any,
    );

    return saved;
  }


  async getDelayedOrders(): Promise<
    { order: Order; action: 'complete' | 'cancel' }[]
  > {
    const now = new Date();

    // Query delayed orders
    const orders = await this.orderRepository
      .createQueryBuilder('o') // use 'o' instead of 'order'
      .where(
        `(o.status = :delivered AND (o.submission_date + COALESCE(o."deliveryTime",0) * interval '1 day') < :now)
     OR
     (o.status = :changeRequested AND (o.submission_date + COALESCE(o."deliveryTime",0) * interval '1 day') < :now)`
      )
      .setParameters({
        delivered: OrderStatus.DELIVERED,
        changeRequested: OrderStatus.ChangeRequested,
        now,
      })
      .getMany();

    // Map to action type
    return orders.map(order => {
      const action =
        order.status === OrderStatus.DELIVERED ? 'complete' : 'cancel';
      return { order, action };
    });
  }


  async getInvoices(query: {
    page?: number;
    limit?: number;
    search?: string;
    status?: PaymentStatus | 'all';
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  }) {
    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 20;
    const skip = (page - 1) * limit;
    const sortField = query.sortBy || 'issuedAt';
    const sortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const qb = this.invoiceRepository.createQueryBuilder('invoice')
      // Join order and buyer
      .leftJoinAndSelect('invoice.order', 'order')
      .leftJoinAndSelect('order.buyer', 'buyer')
      // Exclude transactionId from selection
      .select([
        'invoice.id',
        'invoice.invoiceNumber',
        'invoice.subtotal',
        'invoice.serviceFee',
        'invoice.platformPercent',
        'invoice.totalAmount',
        'invoice.issuedAt',
        'invoice.paymentStatus',
        'invoice.paymentMethod',
        'order.id',
        'order.title',
        'order.totalAmount',
        'order.status',
        'buyer.id',
        'buyer.username',
        'buyer.email',
      ]);

    // Filter by paymentStatus if provided
    if (query.status && query.status !== 'all') {
      qb.andWhere('invoice.paymentStatus = :status', { status: query.status });
    }

    // Search by invoice number or order title
    if (query.search) {
      qb.andWhere(
        '(invoice.invoiceNumber ILIKE :search OR order.title ILIKE :search)',
        { search: `%${query.search}%` }
      );
    }

    qb.orderBy(`invoice.${sortField}`, sortOrder)
      .skip(skip)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();


    // Map result to move buyer out of order
    const records = data.map(inv => {
      const { order, ...invoice } = inv as any;
      const buyer = order?.buyer || null;
      const orderData = { ...order };
      delete orderData.buyer;

      return {
        ...invoice,
        order: orderData,
        buyer,
      };
    });

    return { records, total_records: total, current_page: page, per_page: limit };
  }
}
