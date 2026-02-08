import { Injectable, NotFoundException, ForbiddenException, BadRequestException, forwardRef, Inject, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import { Order, Service, User, Invoice, Payment, OrderStatus, UserRole, PaymentStatus, Job, Proposal, Setting, ProposalStatus, JobStatus, Notification, Dispute, DisputeStatus, OrderSubmission, OrderChangeRequest, UserRelatedAccount, PaymentMethod, PaymentMethodType, Transaction, TransactionStatus, TransactionType, OrderOfflineContract } from 'entities/global.entity';
import { AccountingService } from 'src/accounting/accounting.service';
import { randomBytes } from 'crypto';
import { CRUD } from 'common/crud.service';
import { PermissionBitmaskHelper } from 'src/auth/permission-bitmask.helper';
import { PermissionDomains, Permissions } from 'entities/permissions';
import { instanceToPlain } from 'class-transformer';
import { PaymentGatewayFactory } from 'src/payments/base/payment.gateway.factory';
import { UnifiedCheckout } from 'src/payments/base/payment.constant';
import { RedisService } from 'common/RedisService';


@Injectable()
export class OrdersService {

  private readonly logger = new Logger(OrdersService.name);

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

    @InjectRepository(UserRelatedAccount)
    public userAccountsRepo: Repository<UserRelatedAccount>,

    @InjectRepository(Transaction)
    public transactionRepo: Repository<Transaction>,

    private readonly dataSource: DataSource,
    private readonly accountingService: AccountingService,
    private readonly gatewayFactory: PaymentGatewayFactory,
    @InjectRepository(Job) private jobRepo: Repository<Job>,
    @InjectRepository(Proposal) private proposalRepo: Repository<Proposal>,
    @InjectRepository(Notification) private notifRepo: Repository<Notification>,
    @InjectRepository(Setting) private settingRepo: Repository<Setting>,
    @InjectRepository(Dispute) private disputeRepo: Repository<Dispute>,

    private readonly redisService: RedisService
  ) { }

  Submission
  SUBMISSIO_AFTER_DAYS = 14;
  async getOrdersForUser(userId: string, query: any) {
    const { search, page = 1, limit = 10, sortBy = 'created_at', sortOrder = 'DESC', status } = query;

    // Fetch user role
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const qb = this.orderRepository.createQueryBuilder('order')
      // 1. Join and select specific fields for Service
      .leftJoin('order.service', 'service')
      .addSelect(['service.id', 'service.title', 'service.gallery', 'service.slug'])

      // 2. Join and select specific fields for Buyer
      .leftJoin('order.buyer', 'buyer')
      .leftJoin('buyer.person', 'buyerPerson')
      .addSelect(['buyer.id', 'buyer.profileImage', 'buyerPerson.username', 'buyerPerson.email'])

      // 3. Join and select specific fields for Seller
      .leftJoin('order.seller', 'seller')
      .leftJoin('seller.person', 'sellerPerson')
      .addSelect(['seller.id', 'seller.profileImage', 'sellerPerson.username', 'sellerPerson.email'])

      // 4. Join and select Disputes (all fields or specific ones)
      .leftJoinAndSelect('order.disputes', 'disputes')

      // 5. Join and select Invoices
      .leftJoinAndSelect('order.invoices', 'invoices')
      // 6. Join and select specific Rating/Review fields for the flow logic
      .leftJoin('order.rating', 'rating')
      .leftJoin('order.offlineContract', 'offlineContract')
      .addSelect([
        'rating.isPublic',
        'rating.buyer_rated_at',
        'rating.seller_rated_at'
      ]);;

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
      const plainOrd = instanceToPlain(order, {
        enableCircularCheck: true
      }) as any;
      return {
        ...plainOrd,
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



  async completeOrderPayment(transactionId: string, isSuccess: boolean, paymentMethod?: string, externalTxId?: string, paymobOrderId?: string) {
    let userId: string | undefined;
    let orderId: string | undefined;

    try {
      await this.dataSource.transaction(async (manager) => {

        const transaction = await manager.findOne(Transaction, {
          where: { id: transactionId },
        });

        if (!transaction) throw new NotFoundException('Transaction not found');

        userId = transaction.userId;
        orderId = transaction.orderId;
        // 2. Skip if already processed
        if (transaction.status !== TransactionStatus.PENDING) {
          throw new BadRequestException('Transaction already processed');
        }

        await manager.update(Transaction, transactionId, {
          externalTransactionId: externalTxId?.toString(),
          externalOrderId: paymobOrderId?.toString(),
          status: isSuccess ? TransactionStatus.COMPLETED : TransactionStatus.FAILED
        });
        const notifRepo = manager.getRepository(Notification);

        if (!isSuccess) {
          await notifRepo.save(notifRepo.create({
            userId: transaction.userId,
            type: 'payment',
            title: 'Payment Failed',
            message: `Your payment attempt for Order #${transaction.orderId} failed. (Ref: ${transactionId}). Please try again.`,
            relatedEntityType: 'transaction',
            relatedEntityId: transactionId,
          }));

          return; // Exit early; do not process order updates or escrow
        }
        // 1. Fetch Order with required relations
        const order = await manager.findOne(Order, {
          where: { id: transaction.orderId },
          relations: ['invoices', 'buyer', 'seller'],
        });

        if (!order) throw new NotFoundException('Order not found');
        if (order.status !== OrderStatus.PENDING) return order; // Already processed

        const invoice = order.invoices?.[0];
        if (!invoice) throw new NotFoundException('Invoice not found');

        // 2. Mark Invoice as Paid
        invoice.paymentStatus = PaymentStatus.PAID;
        invoice.paymentMethod = paymentMethod; // Dynamic from order
        invoice.transactionId = transactionId;
        await manager.save(invoice);

        // 3. Update Order Status
        order.status = OrderStatus.WAITING;
        await manager.save(order);

        // 4. Update Service Stats (Increment count)
        if (order.serviceId) {
          await manager.update(Service, order.serviceId, {
            ordersCount: () => `"orders_count" + 1`,
          });
        }

        // 5. Execute Escrow Logic (PASS THE MANAGER)
        // Ensure your accounting service supports receiving a manager to stay in TX
        await this.accountingService.holdEscrow(order.id, manager)

        // 6. Create Notifications
        const amount = Number(invoice.totalAmount ?? order.totalAmount);
        const currency = 'SAR';


        await notifRepo.save([
          notifRepo.create({
            userId: order.buyerId,
            type: 'payment',
            title: 'Payment Successful',
            message: `Your payment of ${amount} ${currency} for “${order.title}” was processed successfully.`,
            relatedEntityType: 'order',
            relatedEntityId: order.id,
          }),
          notifRepo.create({
            userId: order.sellerId,
            type: 'payment',
            title: 'Order Paid',
            message: `The order “${order.title}” has been paid. Start working now!`,
            relatedEntityType: 'order',
            relatedEntityId: order.id,
          })
        ]);

        this.logger.log(`✅ order marked paid successfully for TX: ${transactionId}`);
        return order;
      });
    }
    finally {
      if (userId && orderId) {
        const resultKey = `result:${userId}-${orderId}`;
        await this.redisService.del(resultKey);
      }
    }
  }

  // async markOrderPaid(orderId: string, userId: string) {
  //   // 1) Commit the authoritative payment state in a single tx
  //   const result = await this.dataSource.transaction(async manager => {
  //     const order = await manager.findOne(Order, {
  //       where: { id: orderId },
  //       relations: ['invoices'],
  //     });
  //     if (!order) throw new NotFoundException('Order not found');

  //     // Only buyer (or admin) can mark it as paid
  //     if (order.buyerId !== userId) throw new ForbiddenException("Only buyer can mark it as paid");

  //     // Check permissions
  //     if (order.status !== OrderStatus.PENDING) {
  //       throw new ForbiddenException('Order cannot be marked as paid because it is not in PENDING status');
  //     }

  //     // Mark invoice as paid
  //     const invoice = order.invoices?.[0];
  //     if (!invoice) throw new NotFoundException('Invoice not found');

  //     invoice.paymentStatus = PaymentStatus.PAID; // 'paid'
  //     invoice.paymentMethod = 'wallet';
  //     invoice.transactionId = `TX-${Date.now()}`;
  //     await manager.save(invoice);

  //     // Update order status
  //     order.status = OrderStatus.WAITING;
  //     await manager.save(order);

  //     // Buyer & Seller notifications inside TX (guaranteed with payment state)
  //     const amount = Number(invoice.totalAmount ?? order.totalAmount);
  //     const currency = 'SAR';
  //     const txId = invoice.transactionId ?? '';
  //     const notifRepo = manager.getRepository(Notification);

  //     // ✅ Increment service order count
  //     if (order.serviceId) {
  //       await manager
  //         .createQueryBuilder()
  //         .update(Service)
  //         .set({ ordersCount: () => `"orders_count" + 1` })
  //         .where('id = :id', { id: order.serviceId })
  //         .execute();
  //     }

  //     const buyerNotif = notifRepo.create({
  //       userId: order.buyerId,
  //       type: 'payment',
  //       title: 'Payment Successful',
  //       message: `Your payment of ${amount} ${currency} for “${order.title}” was processed successfully. Transaction: ${txId}.`,
  //       relatedEntityType: 'order',
  //       relatedEntityId: order.id,
  //     });

  //     const sellerNotif = notifRepo.create({
  //       userId: order.sellerId,
  //       type: 'payment',
  //       title: 'Order Paid',
  //       // We tell seller the order price (200) as base, not the total buyer paid (210)
  //       message: `The order “${order.title}” has been paid (${amount - invoice.platformPercent} ${currency}). Transaction: ${txId}.`,
  //       relatedEntityType: 'order',
  //       relatedEntityId: order.id,
  //     });

  //     await notifRepo.save([buyerNotif, sellerNotif]);

  //     return {
  //       orderId: order.id,
  //       status: order.status,
  //       invoiceId: invoice.id,
  //       amount,
  //       currency,
  //       txId,
  //       orderTitle: order.title,
  //     };
  //   });

  //   await this.accountingService.holdEscrow(result.orderId);

  //   return result;
  // }

  async adminManualFinalize(orderId: string) {
    // 1. Fetch Order and Invoice to get the amount and buyerId
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['invoices'],
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Order is already processed');
    }

    const invoice = order.invoices?.[0];
    if (!invoice) throw new NotFoundException('Invoice not found');

    // 2. Create the Manual Transaction Record
    // We do this first so that completeOrderPayment has a transaction to lock onto

    const transaction = await this.transactionRepo.save(
      this.transactionRepo.create({
        userId: order.buyerId,
        orderId: order.id,
        amount: invoice.totalAmount,
        status: TransactionStatus.PENDING, // completeOrderPayment will move this to COMPLETED
        currencyId: 'SAR',
        type: TransactionType.ESCROW_DEPOSIT,
        description: `Manual Admin Finalization - Order #${order.id} - Price: ${invoice.totalAmount} SAR`,
      }),
    );

    // 3. Delegate to completeOrderPayment logic
    // This handles order status, service counts, notifications, and Redis trimming
    await this.completeOrderPayment(
      transaction.id,
      true, // isSuccess
      'ADMIN_MANUAL', // paymentMethod
    );

    return order;
  }

  async processOrderPayment(dto: UnifiedCheckout, orderId: string) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['invoices'],
    });

    if (!order) throw new NotFoundException('Order not found');

    // 1. Consistency Check: Validate Invoice exists and is unpaid
    const invoice = order.invoices?.[0];
    if (!invoice) throw new NotFoundException('No invoice found for this order');

    if (invoice.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('This invoice has already been paid');
    }

    // 2. Permission Check
    if (order.buyerId !== dto.userId) {
      throw new ForbiddenException("Only the buyer can process payment");
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new ForbiddenException('Order is not in a payable state');
    }

    // 3. Pass both Order and Invoice to the gateway for accurate amount handling
    const gateway = this.gatewayFactory.getGateway();
    return await gateway.createPaymentIntention(dto, order, invoice);
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
      relations: {
        service: true,
        buyer: {
          person: true // Fetches person details for the buyer
        },
        seller: {
          person: true // Fetches person details for the seller
        },
        invoices: true
      },
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

  async getOrder(userId: string, userRole: string, orderId: string, req: any, manager?: EntityManager) {
    const orderRepo = manager ? manager.getRepository(Order) : this.orderRepository;
    const order = await orderRepo.findOne({
      where: { id: orderId },
      relations: {
        service: {
          seller: { person: true } // If the service object also needs the seller's profile
        },
        buyer: {
          person: true            // Essential for buyer's name/email
        },
        seller: {
          person: true            // Essential for seller's name/email
        },
        invoices: {
          payments: true          // Keeps your invoice and payment history
        },
        offlineContract: true
      }
    });

    const permissions = req.user.permissions;
    if (req.user?.role === 'admin' || PermissionBitmaskHelper.has(permissions?.[PermissionDomains.ORDERS], Permissions.Orders.View) ||
      (userRole === UserRole.BUYER && order.buyerId === userId) || (userRole === UserRole.SELLER && order.sellerId === userId)) {
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      return order;
    }


    throw new ForbiddenException('Access denied');
  }

  async createOrderCheckout(userId: string, createOrderDto: any) {
    return await this.dataSource.transaction(async (manager) => {

      const { serviceId, packageType, quantity, requirementsAnswers, notes } = createOrderDto;
      const s = await manager.find(Setting, { take: 1, order: { created_at: 'DESC' } });

      const service = await manager.findOne(Service, { where: { id: serviceId, status: 'Active' } } as any);
      if (!service) throw new NotFoundException('Service not found or not available');

      const relation = await manager.findOne(UserRelatedAccount, { where: { mainUserId: userId, subUserId: service.sellerId } })
      if (relation) {
        throw new ConflictException('You cannot place an order because you’re already linked to this seller');
      }

      const seller = await manager.findOne(User, { where: { id: service.sellerId } });
      if (!seller) throw new NotFoundException('Seller not found');


      const packageData = service.packages.find((pkg: any) => pkg.type === packageType);
      if (!packageData) throw new BadRequestException('Invalid package type');

      const platformPercent = Number(s?.[0]?.platformPercent ?? 10);
      const sellerServiceFee = Number(s?.[0]?.sellerServiceFee ?? 10);
      const isPOD = service.payOnDelivery;
      const subtotal = packageData.price * quantity;
      const totalAmount = isPOD ? platformPercent : subtotal + platformPercent;

      const order = manager.create(Order, {
        buyerId: userId,
        sellerId: service.sellerId,
        serviceId,
        title: service.title,
        quantity,
        totalAmount,
        sellerServiceFee,
        packageType,
        requirementsAnswers,
        status: OrderStatus.PENDING, // waiting for payment
        orderDate: new Date(),
        deliveryTime: packageData.deliveryTime,
        notes: notes
      });

      const savedOrder = await manager.save(order);

      // ---- Invoice
      const checkoutToken = randomBytes(16).toString('hex');

      const invoice = manager.create(Invoice, {
        invoiceNumber: `INV-${Date.now()}-${savedOrder.id.slice(-6)}`,
        orderId: savedOrder.id,
        order: savedOrder,
        subtotal: isPOD ? 0 : subtotal,
        sellerServiceFee,
        platformPercent,
        totalAmount,
        payOnDelivery: service.payOnDelivery,
        issuedAt: new Date(),
        paymentStatus: PaymentStatus.PENDING,
      });

      if (isPOD) {
        await manager.save(OrderOfflineContract, {
          orderId: order.id,
          buyerId: userId,
          sellerId: service.sellerId,
          amountToPayAtDoor: subtotal, // e.g. 500 SAR
          platformFeePaidOnline: platformPercent,
        });
      }

      await manager.save(invoice);

      const notifRepo = manager.getRepository(Notification);
      const sellerNotif = notifRepo.create({
        userId: service.sellerId,
        type: 'order',
        title: 'New Order Received',
        message: `You have received a new order for your service "${service.title}".`,
        relatedEntityType: 'order',
        relatedEntityId: savedOrder.id,
      });

      await notifRepo.save(sellerNotif);

      const paymentUrl = `${process.env.FRONTEND_URL}/payment?orderId=${savedOrder.id}&invoice=${invoice.invoiceNumber}&token=${checkoutToken}`;

      // Return order + simulated checkout link
      return {
        order: savedOrder,
        paymentUrl,
      };
    });
  }

  async createOrder(userId: string, createOrderDto: any) {
    const { serviceId, packageType, quantity, requirementsAnswers } = createOrderDto;

    return await this.dataSource.transaction(async (manager) => {

      const service = await manager.findOne(Service, {
        where: { id: serviceId, status: 'Active' },
      } as any);

      if (!service) {
        throw new NotFoundException('Service not found or not available');
      }

      const seller = await manager.findOne(User, {
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
      const s = await manager.find(Setting, { take: 1, order: { created_at: 'DESC' } });
      const platformPercent = Number(s?.[0]?.platformPercent ?? 10);;
      const sellerServiceFee = Number(s?.[0]?.sellerServiceFee ?? 10);;
      const subtotal = packageData.price * quantity;
      const isPOD = service.payOnDelivery;
      const totalAmount = isPOD ? platformPercent : subtotal + platformPercent;

      const order = manager.create(Order, {
        buyerId: userId,
        sellerId: service.sellerId,
        serviceId,
        title: service.title,
        quantity,
        totalAmount,
        sellerServiceFee,
        packageType,
        requirementsAnswers,
        status: OrderStatus.PENDING,
        orderDate: new Date(),
        deliveryTime: packageData.deliveryTime,
      });

      const savedOrder = await manager.save(order);

      // Create invoice

      const invoice = manager.create(Invoice, {
        invoiceNumber: `INV-${Date.now()}-${savedOrder.id.slice(-6)}`,
        orderId: savedOrder.id,
        subtotal: isPOD ? 0 : subtotal,
        sellerServiceFee,
        platformPercent,
        totalAmount,
        payOnDelivery: service.payOnDelivery,
        issuedAt: new Date(),
        paymentStatus: PaymentStatus.PENDING,
      });

      if (isPOD) {
        await manager.save(OrderOfflineContract, {
          orderId: order.id,
          buyerId: userId,
          sellerId: service.sellerId,
          amountToPayAtDoor: subtotal, // e.g. 500 SAR
          platformFeePaidOnline: platformPercent,
        });
      }

      await manager.save(invoice);
      //send notification to seller
      const notifRepo = manager.getRepository(Notification);
      const sellerNotif = notifRepo.create({
        userId: service.sellerId,
        type: 'order',
        title: 'New Order Received',
        message: `You have received a new order for your service "${service.title}".`,
        relatedEntityType: 'order',
        relatedEntityId: savedOrder.id,
      });

      await notifRepo.save(sellerNotif);
      return savedOrder;
    });
  }

  private async updateSellerStats(order: Order, manager?: EntityManager) {
    const userRepo = manager ? manager.getRepository(User) : this.userRepository;
    const orderRepo = manager ? manager.getRepository(Order) : this.orderRepository;

    const seller = await userRepo.findOne({ where: { id: order.sellerId } });
    if (!seller) return;

    // Increase completed orders
    seller.ordersCompleted = (seller.ordersCompleted || 0) + 1;

    // Check if this buyer is first-time
    const previousOrders = await orderRepo.count({
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

    await userRepo.save(seller);
  }

  // Helper: Send notifications to both parties to rate each other
  private async sendRatingNotifications(order: Order, manager?: EntityManager) {
    const notificationRepo = manager ? manager.getRepository(Notification) : this.notifRepo;
    // 1. Notify Buyer
    const buyerNotif = notificationRepo.create({
      userId: order.buyerId,
      type: 'rating', // specific type for frontend routing
      title: 'How was your experience?',
      message: `Your order "${order.title}" is complete! Please take a moment to review the freelancer's work to help others in the community.`,
      relatedEntityType: 'order',
      relatedEntityId: order.id,
    });

    // 2. Notify Seller
    const sellerNotif = notificationRepo.create({
      userId: order.sellerId,
      type: 'rating',
      title: 'Share your feedback',
      message: `The order "${order.title}" is finished. Please rate your experience working with this client to complete the process.`,
      relatedEntityType: 'order',
      relatedEntityId: order.id,
    });

    // Save both in one transaction
    await notificationRepo.save([buyerNotif, sellerNotif]);
  }


  async updateOrderStatus(userId: string, userRole: string, orderId: string, status: string, req: any) {
    const order = await this.getOrder(userId, userRole, orderId, req);

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
        await this.sendRatingNotifications(order)
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
    req: any
  ) {
    return await this.dataSource.transaction(async (manager) => {

      const order = await this.getOrder(userId, UserRole.SELLER, orderId, req, manager);

      if (order.status !== OrderStatus.ACCEPTED && order.status !== OrderStatus.ChangeRequested) {
        throw new BadRequestException('Order must be accepted before delivery');
      }

      // Block if dispute exists
      const hasDispute = await this.disputeRepo.exist({
        where: { orderId, status: In([DisputeStatus.OPEN, DisputeStatus.IN_REVIEW]) as any },
      });
      if (hasDispute) throw new BadRequestException('Order is in dispute');


      // --- Add submission ---
      const submission = manager.create(OrderSubmission, {
        orderId,
        sellerId: userId,
        message: submissionData.message || null,
        files: submissionData.files || [],
      });
      await manager.save(submission);

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
      const saved = await manager.save(order);

      // 🔔 notify buyer
      await manager.save(Notification,
        manager.create(Notification, {
          userId: order.buyerId,
          type: 'order_delivered',
          title: 'Order delivered',
          message: `The seller delivered "${order.title}". Please review and confirm receipt.`,
          relatedEntityType: 'order',
          relatedEntityId: order.id,
        }) as any,
      );

      return saved;
    });
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
    req: any
  ) {
    return await this.dataSource.transaction(async (manager) => {

      // Fetch order
      const order = await this.getOrder(userId, UserRole.BUYER, orderId, req, manager);

      if (![OrderStatus.DELIVERED].includes(order.status)) {
        throw new BadRequestException('Cannot request changes for this order at its current status');
      }

      // Create OrderChangeRequest
      const changeRequest = manager.create(OrderChangeRequest, {
        orderId,
        buyerId: userId,
        message: changeData.message || null,
        files: changeData.files || [],
      });

      await manager.save(changeRequest);

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

      const savedOrder = await manager.save(order);

      // Notify seller
      await manager.save(Notification,
        manager.create(Notification, {
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
    });
  }


  async cancelOrder(userId: string, userRole: string, orderId: string, req: any, reason?: string) {
    return await this.dataSource.transaction(async (manager) => {

      const order = await this.getOrder(userId, userRole, orderId, req, manager);

      // Only the buyer can cancel the order
      if (order.buyerId !== userId) {
        throw new ForbiddenException('Only the buyer can cancel this order');
      }

      if (![OrderStatus.PENDING, OrderStatus.WAITING].includes(order.status)) {
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
      const invoiceRepo = manager.getRepository(Invoice);
      // Process refund if payment was made
      const invoice = await invoiceRepo.findOne({
        where: { orderId },
      });

      if (invoice && invoice.paymentStatus === PaymentStatus.PAID) {
        await this.accountingService.refundEscrowToBuyer(orderId, manager);
      }

      await manager.save(
        manager.create(Notification, {
          userId: order.sellerId,
          type: "order_cancelled",
          title: "Order Cancelled",
          message: "The buyer has cancelled the order.",
          relatedEntityType: 'order',
          relatedEntityId: orderId,
        }),
      );

      return manager.save(order);
    });
  }


  async rejectOrder(userId: string, userRole: string, orderId: string, req: any, reason?: string) {
    return await this.dataSource.transaction(async (manager) => {

      const order = await this.getOrder(userId, userRole, orderId, req, manager);

      // Only the buyer can cancel the order
      if (order.sellerId !== userId) {
        throw new ForbiddenException('Only the seller can reject this order');
      }

      if (![OrderStatus.PENDING, OrderStatus.WAITING].includes(order.status)) {
        throw new BadRequestException('Order cannot be rejected at this stage');
      }

      order.status = OrderStatus.REJECTED;
      order.cancelledAt = new Date();

      // timeline
      order.timeline = [
        ...(order.timeline || []),
        {
          type: 'rejected',
          at: new Date().toISOString(),
          by: 'seller',
        },
      ];

      const invoiceRepo = manager.getRepository(Invoice);
      // Process refund if payment was made
      const invoice = await invoiceRepo.findOne({
        where: { orderId },
      });

      if (invoice && invoice.paymentStatus === PaymentStatus.PAID) {
        await this.accountingService.refundEscrowToBuyer(orderId, manager);
      }

      await manager.save(
        manager.create(Notification, {
          userId: order.buyerId,
          type: "order_rejected",
          title: "Order Rejected",
          message: "Your order has been rejected by the seller.",
          relatedEntityType: 'order',
          relatedEntityId: orderId,
        }),
      );

      return manager.save(order);
    });
  }

  async acceptOrder(userId: string, userRole: string, orderId: string, req: any, reason?: string) {
    const order = await this.getOrder(userId, userRole, orderId, req);

    // Only the buyer can cancel the order
    if (order.sellerId !== userId) {
      throw new ForbiddenException('Only the seller can accept this order');
    }


    if (![OrderStatus.WAITING].includes(order.status)) {
      throw new BadRequestException('Order cannot be accepted at this stage');
    }

    order.status = OrderStatus.ACCEPTED;

    // timeline
    order.timeline = [
      ...(order.timeline || []),
      {
        type: 'accepted',
        at: new Date().toISOString(),
        by: 'seller',
      },
    ];


    await this.notifRepo.save(
      this.notifRepo.create({
        userId: order.buyerId,
        type: "order_accepted",
        title: "Order Accepted",
        message: "Your order has been accepted by the seller.",
        relatedEntityType: 'order',
        relatedEntityId: orderId,
      }),
    );

    return this.orderRepository.save(order);
  }

  async autoCancel(orderId: string) {
    return await this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        relations: {
          service: {
            seller: { person: true } // If the service object also needs the seller's profile
          },
          buyer: {
            person: true            // Essential for buyer's name/email
          },
          seller: {
            person: true            // Essential for seller's name/email
          },
          invoices: {
            payments: true          // Keeps your invoice and payment history
          }
        }
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
      const invoice = await manager.findOne(Invoice, {
        where: { orderId },
      });

      if (invoice && invoice.paymentStatus === PaymentStatus.PAID) {
        await this.accountingService.refundEscrowToBuyer(orderId, manager);
      }
      const notifications = [
        // Notify Buyer
        manager.create(Notification, {
          userId: order.buyerId,
          type: 'order_cancelled',
          title: 'Order Automatically Cancelled',
          message: `Your order for "${order.title}" was cancelled and funds have been refunded to your wallet.`,
          relatedEntityType: 'order',
          relatedEntityId: order.id,
        }),
        // Notify Seller
        manager.create(Notification, {
          userId: order.sellerId,
          type: 'order_cancelled',
          title: 'Order Cancelled (System)',
          message: `Order "${order.title}" was cancelled because the change request period expired.`,
          relatedEntityType: 'order',
          relatedEntityId: order.id,
        })
      ];

      // 6. Save all changes atomically
      await manager.save([order, ...notifications]);
      return manager.save(order);
    });
  }

  async autoComplete(orderId: string) {
    return await this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        relations: {
          service: {
            seller: { person: true } // If the service object also needs the seller's profile
          },
          buyer: {
            person: true            // Essential for buyer's name/email
          },
          seller: {
            person: true            // Essential for seller's name/email
          },
          invoices: {
            payments: true          // Keeps your invoice and payment history
          }
        }
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

      await this.accountingService.releaseEscrow(orderId, manager); // subtotal → seller

      // Update seller stats
      await this.updateSellerStats(order, manager);
      await this.sendRatingNotifications(order, manager)
      // 🔔 notify seller
      const notifications = [
        // Notify Seller: They got paid
        manager.create(Notification, {
          userId: order.sellerId,
          type: 'order_completed',
          title: 'Order Completed Automatically',
          message: `The order "${order.title}" has been completed automatically. Your earnings are now available in your balance.`,
          relatedEntityType: 'order',
          relatedEntityId: order.id,
        }),
        // Notify Buyer: Transaction closed
        manager.create(Notification, {
          userId: order.buyerId,
          type: 'order_completed',
          title: 'Order Closed',
          message: `Your order for "${order.title}" was automatically marked as completed after the delivery period.`,
          relatedEntityType: 'order',
          relatedEntityId: order.id,
        })
      ];

      // 4. Save Order and Notifications together
      await manager.save([order, ...notifications]);

      return saved;
    });
  }

  // called by PaymentsService.confirmPayment
  async finalizeOrderFromProposalPayment(orderId: string) {
    await this.dataSource.transaction(async m => {
      const order = await m.getRepository(Order).findOne({
        where: { id: orderId },
        relations: ['proposal', 'job'],
      });
      if (!order?.proposal || !order?.job) throw new NotFoundException('Order context invalid');

      const proposalRepo = m.getRepository(Proposal);
      const jobRepo = m.getRepository(Job);
      const notifRepo = m.getRepository(Notification);

      const job = order.job;
      const acceptedProposal = await proposalRepo.findOne({
        where: { id: order.proposalId },
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

  async completeOrder(userId: string, orderId: string, req: any) {
    return await this.dataSource.transaction(async (manager) => {

      const order = await this.getOrder(userId, UserRole.BUYER, orderId, req, manager);
      if (order.status !== OrderStatus.DELIVERED) {
        throw new BadRequestException('Order must be delivered before completion');
      }

      if (order.buyerId !== userId) {
        throw new NotFoundException('Order not found');
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

      await this.accountingService.releaseEscrow(orderId, manager); // subtotal → seller

      // Update seller stats
      await this.updateSellerStats(order, manager);
      await this.sendRatingNotifications(order, manager)
      // 🔔 notify seller
      await manager.save(Notification,
        manager.create(Notification, {
          userId: order.sellerId,
          type: 'order_completed',
          title: 'Order completed',
          message: `The buyer confirmed completion for "${order.title}". Payout is now available.`,
          relatedEntityType: 'order',
          relatedEntityId: order.id,
        }) as any,
      );

      return saved;
    });
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
      .leftJoinAndSelect('buyer.person', 'person')
      // Exclude transactionId from selection
      .select([
        'invoice.id',
        'invoice.invoiceNumber',
        'invoice.subtotal',
        'invoice.sellerServiceFee',
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
        'person.username',
        'person.email',
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
      const plainInv = instanceToPlain(inv, {
        enableCircularCheck: true
      }) as any;
      const { order, ...invoice } = plainInv as any;

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
