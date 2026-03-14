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
import { TranslationService } from 'common/translation.service';
import { NotificationService } from 'src/notification/notification.service';


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


    @InjectRepository(UserRelatedAccount)
    public userAccountsRepo: Repository<UserRelatedAccount>,

    @InjectRepository(Transaction)
    public transactionRepo: Repository<Transaction>,

    private readonly dataSource: DataSource,
    private readonly accountingService: AccountingService,
    private readonly gatewayFactory: PaymentGatewayFactory,
    public notificationService: NotificationService,

    @InjectRepository(Dispute) private disputeRepo: Repository<Dispute>,

    private readonly redisService: RedisService,
    private readonly i18n: TranslationService,
  ) { }

  Submission
  SUBMISSIO_AFTER_DAYS = 14;
  async getOrdersForUser(userId: string, query: any) {
    const { search, page = 1, limit = 10, sortBy = 'created_at', sortOrder = 'DESC', status } = query;

    // Fetch user role
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(this.i18n.t('events.orders.user_not_found'));

    const qb = this.orderRepository.createQueryBuilder('order')
      // 1. Join and select specific fields for Service
      .leftJoin('order.service', 'service')
      .addSelect(['service.id', 'service.title', 'service.gallery', 'service.slug'])

      // 2. Join and select specific fields for Buyer
      .leftJoin('order.buyer', 'buyer')
      .leftJoin('buyer.person', 'buyerPerson')
      .addSelect(['buyer.role', 'buyer.id', 'buyer.profileImage', 'buyerPerson.username', 'buyerPerson.email'])

      // 3. Join and select specific fields for Seller
      .leftJoin('order.seller', 'seller')
      .leftJoin('seller.person', 'sellerPerson')
      .addSelect(['seller.role', 'seller.id', 'seller.profileImage', 'sellerPerson.username', 'sellerPerson.email'])

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

        if (!transaction) throw new NotFoundException(this.i18n.t('events.orders.transaction_not_found'));

        userId = transaction.userId;
        orderId = transaction.orderId;
        // 2. Skip if already processed
        if (!(transaction.status === TransactionStatus.PENDING ||
          transaction.status === TransactionStatus.FAILED)) {
          throw new BadRequestException(this.i18n.t('events.orders.transaction_already_processed'));
        }
        // const payment = await manager.findOne(Payment, {
        //   where: { transactionId: transactionId }
        // });

        // if (payment) {
        //   payment.status = isSuccess ? PaymentStatus.PAID : PaymentStatus.FAILED;
        //   payment.paidAt = isSuccess ? new Date() : null
        //   await manager.save(payment);
        // }
        await manager.update(Transaction, transactionId, {
          externalTransactionId: externalTxId?.toString(),
          externalOrderId: paymobOrderId?.toString(),
          status: isSuccess ? TransactionStatus.COMPLETED : TransactionStatus.FAILED
        });

        if (!isSuccess) {
          await this.notificationService.notifyWithLang({
            userIds: [transaction.userId],
            type: 'payment',
            title: {
              key: 'events.orders.payment_failed_title'
            },
            message: {
              key: 'events.orders.payment_failed_msg',
              args: {
                orderId: transaction.orderId,
                transactionId: transactionId
              }
            },
            relatedEntityId: transactionId,
            relatedEntityType: 'transaction'
          });

          return; // Exit early; do not process order updates or escrow
        }
        // 1. Fetch Order with required relations
        const order = await manager.findOne(Order, {
          where: { id: transaction.orderId },
          relations: ['invoices', 'buyer', 'seller'],
        });

        if (!order) throw new NotFoundException(this.i18n.t('events.orders.order_not_found'));
        if (order.status !== OrderStatus.PENDING) return order; // Already processed

        const invoice = order.invoices?.[0];
        if (!invoice) throw new NotFoundException(this.i18n.t('events.orders.invoice_not_found'));

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
        const amount = Number(invoice.totalAmount);
        const currency = 'SAR';


        // 1. Notify Buyer (Payment confirmation)
        await this.notificationService.notifyWithLang({
          userIds: [order.buyerId],
          type: 'payment',
          title: { key: 'events.orders.payment_success_title' },
          message: {
            key: 'events.orders.payment_success_msg',
            args: { amount, currency, title: order.title }
          },
          relatedEntityId: order.id,
          relatedEntityType: 'order',
          manager // Use if this call is within a transaction
        });

        // 2. Notify Seller (Order status update)
        await this.notificationService.notifyWithLang({
          userIds: [order.sellerId],
          type: 'payment',
          title: { key: 'events.orders.order_paid_title' },
          message: {
            key: 'events.orders.order_paid_msg',
            args: { title: order.title }
          },
          relatedEntityId: order.id,
          relatedEntityType: 'order',
          manager
        });

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
  //     const amount = Number(invoice.totalAmount);
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

    if (!order) throw new NotFoundException(this.i18n.t('events.orders.order_not_found'));
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(this.i18n.t('events.orders.transaction_already_processed'));
    }

    const invoice = order.invoices?.[0];
    if (!invoice) throw new NotFoundException(this.i18n.t('events.orders.invoice_not_found'));

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
        description: this.i18n.t('events.orders.manual_finalize_description', { args: { orderId: order.id, amount: invoice.totalAmount } }),
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

    if (!order) throw new NotFoundException(this.i18n.t('events.orders.order_not_found'));

    // 1. Consistency Check: Validate Invoice exists and is unpaid
    const invoice = order.invoices?.[0];
    if (!invoice) throw new NotFoundException(this.i18n.t('events.orders.invoice_not_found'));

    if (invoice.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException(this.i18n.t('events.orders.already_paid'));
    }

    // 2. Permission Check
    if (order.buyerId !== dto.userId) {
      throw new ForbiddenException(this.i18n.t('events.orders.only_buyer_pay'));
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new ForbiddenException(this.i18n.t('events.orders.not_payable'));
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
    const query = orderRepo.createQueryBuilder('order')
      // 1. Core Relations (The ones you had before)
      .leftJoinAndSelect('order.service', 'service')
      .leftJoinAndSelect('service.seller', 'serviceSeller')
      .leftJoinAndSelect('serviceSeller.person', 'serviceSellerPerson')

      .leftJoinAndSelect('order.buyer', 'buyer')
      .leftJoinAndSelect('buyer.person', 'buyerPerson')

      .leftJoinAndSelect('order.seller', 'seller')
      .leftJoinAndSelect('seller.person', 'sellerPerson')

      .leftJoinAndSelect('order.invoices', 'invoices')
      .leftJoinAndSelect('invoices.payments', 'payments')

      // 2. The Offline Contract Relation (with its nested person data)
      .leftJoinAndSelect('order.offlineContract', 'offlineContract')
      .leftJoinAndSelect('offlineContract.buyer', 'ocBuyer')
      .leftJoinAndSelect('ocBuyer.person', 'ocBuyerPerson')
      .leftJoinAndSelect('offlineContract.seller', 'ocSeller')
      .leftJoinAndSelect('ocSeller.person', 'ocSellerPerson')

      // 3. The Rating Relation with specific fields
      .leftJoin('order.rating', 'rating')
      .addSelect([
        'rating.isPublic',
        'rating.buyer_rated_at',
        'rating.seller_rated_at'
      ])

      // 4. Filters
      .where('order.id = :id', { id: orderId });
    const order = await query.getOne();

    const permissions = req.user.permissions;
    if (req.user?.role === 'admin' || PermissionBitmaskHelper.has(permissions?.[PermissionDomains.ORDERS], Permissions.Orders.View) ||
      (userRole === UserRole.BUYER && order.buyerId === userId) || (userRole === UserRole.SELLER && order.sellerId === userId)) {
      if (!order) {
        throw new NotFoundException(this.i18n.t('events.orders.order_not_found'));
      }

      return order;
    }


    throw new ForbiddenException(this.i18n.t('events.orders.access_denied'));
  }

  async getActiveOrdersWithUser(currentUserId: string, otherUserId: string) {
    return await this.orderRepository.find({
      where: [
        {
          buyerId: currentUserId,
          sellerId: otherUserId,
          status: Not(In([OrderStatus.PENDING, OrderStatus.WAITING, OrderStatus.CANCELLED]))
        },
        {
          buyerId: otherUserId,
          sellerId: currentUserId,
          status: Not(In([OrderStatus.PENDING, OrderStatus.WAITING, OrderStatus.CANCELLED]))
        }
      ],
      // Only select requested fields + createdAt (mapped from created_at)
      select: {
        id: true,
        title: true,
        status: true,
        created_at: true,
      },
      order: { created_at: 'DESC' }
    });
  }

  async createOrderCheckout(userId: string, createOrderDto: any) {
    return await this.dataSource.transaction(async (manager) => {

      const { serviceId, packageType, quantity, requirementsAnswers, notes } = createOrderDto;
      const s = await manager.find(Setting, { take: 1, order: { created_at: 'DESC' } });

      const service = await manager.findOne(Service, { where: { id: serviceId, status: 'Active' } } as any);
      if (!service) throw new NotFoundException(this.i18n.t('events.orders.service_not_found'));

      const relation = await manager.findOne(UserRelatedAccount, { where: { mainUserId: userId, subUserId: service.sellerId } })
      if (relation) {
        throw new ConflictException(this.i18n.t('events.orders.linked_to_seller'));
      }

      const seller = await manager.findOne(User, { where: { id: service.sellerId } });
      if (!seller) throw new NotFoundException(this.i18n.t('events.orders.seller_not_found'));


      const packageData = service.packages.find((pkg: any) => pkg.type === packageType);
      if (!packageData) throw new BadRequestException(this.i18n.t('events.orders.invalid_package'));

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
        totalAmount: subtotal + platformPercent,
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

      await this.notificationService.notifyWithLang({
        userIds: [service.sellerId],
        type: 'order',
        title: {
          key: 'events.orders.new_order_title'
        },
        message: {
          key: 'events.orders.new_order_msg',
          args: { title: service.title }
        },
        relatedEntityId: savedOrder.id,
        relatedEntityType: 'order',
        manager // Keeps the notification within the order creation transaction
      });

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
        throw new NotFoundException(this.i18n.t('events.orders.service_not_found'));
      }

      const seller = await manager.findOne(User, {
        where: { id: service.sellerId },
      });

      if (!seller) {
        throw new NotFoundException(this.i18n.t('events.orders.seller_not_found'));
      }

      // Calculate total amount based on package type
      const packageData = service.packages.find((pkg: any) => pkg.type === packageType);
      if (!packageData) {
        throw new BadRequestException(this.i18n.t('events.orders.invalid_package'));
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
        totalAmount: subtotal + platformPercent,
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
      await this.notificationService.notifyWithLang({
        userIds: [service.sellerId],
        type: 'order',
        title: {
          key: 'events.orders.new_order_title'
        },
        message: {
          key: 'events.orders.new_order_msg',
          args: { title: service.title }
        },
        relatedEntityId: savedOrder.id,
        relatedEntityType: 'order',
        manager // Uses the existing transaction manager
      });
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
    // 1. Notify Buyer
    await this.notificationService.notifyWithLang({
      userIds: [order.buyerId],
      type: 'rating',
      title: { key: 'events.orders.rating_buyer_title' },
      message: {
        key: 'events.orders.rating_buyer_msg',
        args: { title: order.title }
      },
      relatedEntityId: order.id,
      relatedEntityType: 'order',
      manager // Pass the manager to keep it in the transaction
    });

    // 2. Notify Seller
    await this.notificationService.notifyWithLang({
      userIds: [order.sellerId],
      type: 'rating',
      title: { key: 'events.orders.rating_seller_title' },
      message: {
        key: 'events.orders.rating_seller_msg',
        args: { title: order.title }
      },
      relatedEntityId: order.id,
      relatedEntityType: 'order',
      manager // Pass the manager here as well
    });
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
      throw new BadRequestException(this.i18n.t('events.orders.invalid_status_transition'));
    }

    // Check permissions
    if (userRole === UserRole.BUYER && status !== OrderStatus.CANCELLED) {
      throw new ForbiddenException(this.i18n.t('events.orders.buyer_only_cancel'));
    }

    if (userRole === UserRole.SELLER && status === OrderStatus.CANCELLED) {
      throw new ForbiddenException(this.i18n.t('events.orders.seller_cannot_cancel'));
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
        throw new BadRequestException(this.i18n.t('events.orders.must_be_accepted_for_delivery'));
      }

      // Block if dispute exists
      const hasDispute = await this.disputeRepo.exist({
        where: { orderId, status: In([DisputeStatus.OPEN, DisputeStatus.IN_REVIEW]) as any },
      });
      if (hasDispute) throw new BadRequestException(this.i18n.t('events.orders.in_dispute'));


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
      await this.notificationService.notifyWithLang({
        userIds: [order.buyerId],
        type: 'order_delivered',
        title: {
          key: 'events.orders.order_delivered_title'
        },
        message: {
          key: 'events.orders.order_delivered_msg',
          args: { title: order.title }
        },
        relatedEntityId: order.id,
        relatedEntityType: 'order',
        manager // Crucial for keeping this inside the delivery transaction
      });
      return saved;
    });
  }

  async getLastSubmission(userId: string, orderId: string) {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(this.i18n.t('events.orders.order_not_found'));

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
    if (!order) throw new NotFoundException(this.i18n.t('events.orders.order_not_found'));

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
        throw new BadRequestException(this.i18n.t('events.orders.cannot_request_changes'));
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
      await this.notificationService.notifyWithLang({
        userIds: [order.sellerId],
        type: 'order_change_requested',
        title: {
          key: 'events.orders.change_requested_title',
          args: { title: order.title }
        },
        // If user provided a custom message, use it; otherwise, use the i18n key
        message: changeData.message
          ? changeData.message
          : { key: 'events.orders.change_requested_msg' },
        relatedEntityId: order.id,
        relatedEntityType: 'order',
        manager // Keep it within the change-request transaction
      });
      return {
        order: savedOrder,
        changeRequest,
      };
    });
  }

  async getOrderActivityTimeline(
    userId: string,
    orderId: string,
    limit: number = 10,
    cursor?: string
  ) {
    // 1. Authorization check
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(this.i18n.t('events.orders.order_not_found'));
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException(this.i18n.t('events.orders.access_denied'));
    }

    // 2. Prepare the Cursor date (Fallback to current time if no cursor)
    const cursorDate = cursor ? new Date(cursor) : new Date();

    // 3. Execute Raw Query with positional parameters ($1, $2, etc.)
    // We include "deleted_at IS NULL" to respect soft deletes
    const rawResults = await this.dataSource.query(`
    SELECT * FROM (
      SELECT 
        id, 
        message, 
        files, 
        created_at AS "createdAt", 
        'submission' AS type 
      FROM order_submissions 
      WHERE "order_id" = $1 AND "deleted_at" IS NULL

      UNION ALL

      SELECT 
        id, 
        message, 
        files, 
        created_at AS "createdAt", 
        'change_request' AS type 
      FROM order_change_requests 
      WHERE "order_id" = $1 AND "deleted_at" IS NULL
    ) AS timeline
    WHERE "createdAt" < $2
    ORDER BY "createdAt" DESC
    LIMIT $3
  `, [orderId, cursorDate, limit + 1]);

    // 4. Calculate next cursor
    const hasMore = rawResults.length > limit;

    // 4. If we have an extra item, remove it from the data array
    if (hasMore) {
      rawResults.pop();
    }

    // 5. The next cursor is the timestamp of the last item in the (now cleaned) array
    const nextCursor = rawResults.length > 0
      ? rawResults[rawResults.length - 1].createdAt
      : null;

    return {
      data: rawResults,
      meta: {
        nextCursor: hasMore ? nextCursor : null,
        hasMore,
        count: rawResults.length
      },
    };
  }

  async cancelOrder(userId: string, userRole: string, orderId: string, req: any, reason?: string) {
    return await this.dataSource.transaction(async (manager) => {

      const order = await this.getOrder(userId, userRole, orderId, req, manager);

      // Only the buyer can cancel the order
      if (order.buyerId !== userId) {
        throw new ForbiddenException(this.i18n.t('events.orders.buyer_only_cancel_order'));
      }

      if (![OrderStatus.PENDING, OrderStatus.WAITING].includes(order.status)) {
        throw new BadRequestException(this.i18n.t('events.orders.not_cancellable'));
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

      await this.notificationService.notifyWithLang({
        userIds: [order.sellerId],
        type: 'order_cancelled',
        title: {
          key: 'events.orders.order_cancelled_title'
        },
        message: {
          key: 'events.orders.order_cancelled_msg'
        },
        relatedEntityId: orderId,
        relatedEntityType: 'order',
        manager // Maintains transactional integrity
      });

      return manager.save(order);
    });
  }


  async rejectOrder(userId: string, userRole: string, orderId: string, req: any, reason?: string) {
    return await this.dataSource.transaction(async (manager) => {

      const order = await this.getOrder(userId, userRole, orderId, req, manager);

      // Only the buyer can cancel the order
      if (order.sellerId !== userId) {
        throw new ForbiddenException(this.i18n.t('events.orders.seller_only_reject'));
      }

      if (![OrderStatus.PENDING, OrderStatus.WAITING].includes(order.status)) {
        throw new BadRequestException(this.i18n.t('events.orders.not_rejectable'));
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

      await this.notificationService.notifyWithLang({
        userIds: [order.buyerId],
        type: 'order_rejected',
        title: {
          key: 'events.orders.order_rejected_title'
        },
        message: {
          key: 'events.orders.order_rejected_msg'
        },
        relatedEntityId: orderId,
        relatedEntityType: 'order',
        manager // Keeps the notification bound to the rejection transaction
      });
      return manager.save(order);
    });
  }

  async acceptOrder(userId: string, userRole: string, orderId: string, req: any, reason?: string) {
    const order = await this.getOrder(userId, userRole, orderId, req);

    // Only the buyer can cancel the order
    if (order.sellerId !== userId) {
      throw new ForbiddenException(this.i18n.t('events.orders.seller_only_accept'));
    }


    if (![OrderStatus.WAITING].includes(order.status)) {
      throw new BadRequestException(this.i18n.t('events.orders.not_acceptable'));
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


    await this.notificationService.notifyWithLang({
      userIds: [order.buyerId],
      type: 'order_accepted',
      title: {
        key: 'events.orders.order_accepted_title'
      },
      message: {
        key: 'events.orders.order_accepted_msg'
      },
      relatedEntityId: orderId,
      relatedEntityType: 'order'
    });

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
        throw new BadRequestException(this.i18n.t('events.orders.not_cancellable'));
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
      // 1. Notify Buyer (Refund context)
      await this.notificationService.notifyWithLang({
        userIds: [order.buyerId],
        type: 'order_cancelled',
        title: { key: 'events.orders.auto_cancelled_buyer_title' },
        message: {
          key: 'events.orders.auto_cancelled_buyer_msg',
          args: { title: order.title }
        },
        relatedEntityId: order.id,
        relatedEntityType: 'order',
        manager
      });

      // 2. Notify Seller (Missed deadline context)
      await this.notificationService.notifyWithLang({
        userIds: [order.sellerId],
        type: 'order_cancelled',
        title: { key: 'events.orders.auto_cancelled_seller_title' },
        message: {
          key: 'events.orders.auto_cancelled_seller_msg',
          args: { title: order.title }
        },
        relatedEntityId: order.id,
        relatedEntityType: 'order',
        manager
      });

      // Note: You only need to save the order now
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
        throw new BadRequestException(this.i18n.t('events.orders.must_be_delivered'));
      }

      // Block if dispute exists
      const hasDispute = await this.disputeRepo.exist({
        where: { orderId, status: In([DisputeStatus.OPEN, DisputeStatus.IN_REVIEW]) as any },
      });
      if (hasDispute) throw new BadRequestException(this.i18n.t('events.orders.in_dispute_blocked'));

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
      // 1. Notify Seller: Payment release context
      await this.notificationService.notifyWithLang({
        userIds: [order.sellerId],
        type: 'order_completed',
        title: { key: 'events.orders.auto_completed_seller_title' },
        message: {
          key: 'events.orders.auto_completed_seller_msg',
          args: { title: order.title }
        },
        relatedEntityId: order.id,
        relatedEntityType: 'order',
        manager
      });

      // 2. Notify Buyer: Closing context
      await this.notificationService.notifyWithLang({
        userIds: [order.buyerId],
        type: 'order_completed',
        title: { key: 'events.orders.auto_completed_buyer_title' },
        message: {
          key: 'events.orders.auto_completed_buyer_msg',
          args: { title: order.title }
        },
        relatedEntityId: order.id,
        relatedEntityType: 'order',
        manager
      });

      // Now save only the order entity
      await manager.save(order);

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
      if (!order?.proposal || !order?.job) throw new NotFoundException(this.i18n.t('events.orders.context_invalid'));

      const proposalRepo = m.getRepository(Proposal);
      const jobRepo = m.getRepository(Job);

      const job = order.job;
      const acceptedProposal = await proposalRepo.findOne({
        where: { id: order.proposalId },
      });
      if (!acceptedProposal) throw new NotFoundException(this.i18n.t('events.orders.proposal_not_found'));

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

        if (toReject.length > 0) {
          await this.notificationService.notifyWithLang({
            userIds: toReject.map(p => p.sellerId),
            type: 'proposal_status_update',
            title: { key: 'events.orders.proposal_rejected_title' },
            message: {
              key: 'events.orders.proposal_rejected_msg',
              args: { title: job.title }
            },
            relatedEntityId: job.id, // Or p.jobId if consistent
            relatedEntityType: 'proposal'
          });
        }
      }

      // job → awarded
      job.status = JobStatus.AWARDED;
      job.closedAt = null;
      await jobRepo.save(job);

      // notify buyer and winner
      // 1. Notify Buyer: Order Activated
      await this.notificationService.notifyWithLang({
        userIds: [job.buyerId],
        type: 'order_created',
        title: { key: 'events.orders.order_activated_title' },
        message: {
          key: 'events.orders.order_activated_msg',
          args: { title: job.title }
        },
        relatedEntityId: order.id,
        relatedEntityType: 'order'
      });

      // 2. Notify Seller: Proposal Accepted
      await this.notificationService.notifyWithLang({
        userIds: [acceptedProposal.sellerId],
        type: 'proposal_status_update',
        title: { key: 'events.orders.proposal_accepted_title' },
        message: {
          key: 'events.orders.proposal_accepted_msg',
          args: { title: job.title }
        },
        relatedEntityId: acceptedProposal.jobId,
        relatedEntityType: 'proposal',
      });
    });
  }

  async completeOrder(userId: string, orderId: string, req: any) {
    return await this.dataSource.transaction(async (manager) => {

      const order = await this.getOrder(userId, UserRole.BUYER, orderId, req, manager);
      if (order.status !== OrderStatus.DELIVERED) {
        throw new BadRequestException(this.i18n.t('events.orders.must_be_delivered'));
      }

      if (order.buyerId !== userId) {
        throw new NotFoundException(this.i18n.t('events.orders.order_not_found'));
      }

      // Block if dispute exists
      const hasDispute = await this.disputeRepo.exist({
        where: { orderId, status: In([DisputeStatus.OPEN, DisputeStatus.IN_REVIEW]) as any },
      });
      if (hasDispute) throw new BadRequestException(this.i18n.t('events.orders.in_dispute_blocked'));

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
      await this.notificationService.notifyWithLang({
        userIds: [order.sellerId],
        type: 'order_completed',
        title: {
          key: 'events.orders.order_completed_title'
        },
        message: {
          key: 'events.orders.order_completed_msg',
          args: { title: order.title }
        },
        relatedEntityId: order.id,
        relatedEntityType: 'order',
        manager // Keeps it within the same transaction as the payment release
      });
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
