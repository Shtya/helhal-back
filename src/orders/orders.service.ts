import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Order, Service, User, Invoice, Payment, OrderStatus, UserRole, PaymentStatus, Job, Proposal, Setting, ProposalStatus, JobStatus, Notification, Wallet } from 'entities/global.entity';
import { AccountingService } from 'src/accounting/accounting.service';
import { randomBytes } from 'crypto';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    public orderRepository: Repository<Order>,
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
  ) {}

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

      // Return what we need for post-commit side-effects
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
    const { serviceId, packageType, quantity, requirementsAnswers } = createOrderDto;

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
      order.completedAt = new Date();
    } else if (status === OrderStatus.CANCELLED) {
      order.cancelledAt = new Date();
    }

    return this.orderRepository.save(order);
  }

  async deliverOrder(userId: string, orderId: string) {
    const order = await this.getOrder(userId, UserRole.SELLER, orderId);

    if (order.status !== OrderStatus.ACCEPTED) {
      throw new BadRequestException('Order must be accepted before delivery');
    }

    order.status = OrderStatus.DELIVERED;
    order.deliveredAt = new Date();

    return this.orderRepository.save(order);
  }

  async cancelOrder(userId: string, userRole: string, orderId: string, reason?: string) {
    const order = await this.getOrder(userId, userRole, orderId);

    if (![OrderStatus.PENDING, OrderStatus.ACCEPTED].includes(order.status)) {
      throw new BadRequestException('Order cannot be cancelled at this stage');
    }

    order.status = OrderStatus.CANCELLED;
    order.cancelledAt = new Date();

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

  // when buyer completes, release escrow to seller
  async completeOrder(userId: string, orderId: string) {
    const order = await this.getOrder(userId, UserRole.BUYER, orderId);
    if (order.status !== OrderStatus.DELIVERED) throw new BadRequestException('Order must be delivered before completion');

    order.status = OrderStatus.COMPLETED;
    order.completedAt = new Date();
    const saved = await this.orderRepository.save(order);

    await this.accountingService.releaseEscrow(orderId); // <- new
    return saved;
  }
}
