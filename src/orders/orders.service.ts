import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, Service, User, Invoice, Payment, OrderStatus, UserRole, PaymentStatus } from 'entities/global.entity';

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
  ) {}

  async getUserOrders(userId: string, userRole: string, status?: string, page: number = 1) {
    const limit = 20;
		console.log(page , limit);
    const skip = (page||1 - 1) * limit;
    
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
     const packageData = service.packages.find((pkg: any) => pkg.name === packageType);
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
    const platformPercent = 10; // Get from settings
    const serviceFee = (totalAmount * platformPercent) / 100;
    const subtotal = totalAmount - serviceFee;

    const invoice = this.invoiceRepository.create({
      invoiceNumber: `INV-${Date.now()}-${savedOrder.id.slice(-6)}`,
      orderId: savedOrder.id,
      subtotal,
      serviceFee,
      platformPercent,
      totalAmount,
      currencyId: 'USD', // Get from settings
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

  async completeOrder(userId: string, orderId: string) {
    const order = await this.getOrder(userId, UserRole.BUYER, orderId);

    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('Order must be delivered before completion');
    }

    order.status = OrderStatus.COMPLETED;
    order.completedAt = new Date();

    // Process payment to seller
    const invoice = await this.invoiceRepository.findOne({
      where: { orderId },
    });

    if (invoice && invoice.paymentStatus === PaymentStatus.PAID) {
      // Transfer funds to seller (implement your payment logic here)
    }

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
}