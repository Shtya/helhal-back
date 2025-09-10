import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, Invoice, Order, User, PaymentMethod, PaymentStatus, PaymentMethodType, TransactionStatus, OrderStatus } from 'entities/global.entity';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Invoice)
    private invoiceRepository: Repository<Invoice>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(PaymentMethod)
    private paymentMethodRepository: Repository<PaymentMethod>,
  ) {}

  async createPaymentIntent(userId: string, orderId: string, paymentMethodType: string) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId, buyerId: userId },
      relations: ['invoices'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Order is not in a payable state');
    }

    const invoice = order.invoices[0];
    if (!invoice) {
      throw new NotFoundException('Invoice not found for this order');
    }

    if (invoice.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('Order already paid');
    }

    // In a real implementation, you would integrate with a payment gateway like Stripe
    // This is a simplified version
    const paymentIntent = {
      id: `pi_${Date.now()}_${orderId}`,
      client_secret: `secret_${Date.now()}_${orderId}`,
      amount: invoice.totalAmount,
      currency: 'usd',
      status: 'requires_payment_method',
    };

    return paymentIntent;
  }

  async confirmPayment(userId: string, paymentIntentId: string, orderId: string) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId, buyerId: userId },
      relations: ['invoices'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const invoice = order.invoices[0];
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // In a real implementation, you would verify the payment with your payment gateway
    // This is a simplified version assuming payment was successful

    // Create payment record
    const payment = this.paymentRepository.create({
      invoiceId: invoice.id,
      userId,
      amount: invoice.totalAmount,
      currencyId: 'USD',
      method: PaymentMethodType.CARD,
      status: TransactionStatus.COMPLETED,
      transactionId: paymentIntentId,
      paidAt: new Date(),
    });

    await this.paymentRepository.save(payment);

    // Update invoice status
    invoice.paymentStatus = PaymentStatus.PAID;
    invoice.paymentMethod = PaymentMethodType.CARD;
    invoice.transactionId = paymentIntentId;
    await this.invoiceRepository.save(invoice);

    // Update order status
    order.status = OrderStatus.ACCEPTED;
    await this.orderRepository.save(order);

    return { success: true, message: 'Payment confirmed successfully' };
  }

  async getUserPaymentMethods(userId: string) {
    return this.paymentMethodRepository.find({
      where: { userId },
      order: { isDefault: 'DESC', created_at: 'DESC' },
    });
  }

  async addPaymentMethod(userId: string, paymentMethodData: any) {
    const paymentMethod:any = this.paymentMethodRepository.create({
      ...paymentMethodData,
      userId,
    });

    // If this is the first payment method, set it as default
    const existingMethods = await this.getUserPaymentMethods(userId);
    if (existingMethods.length === 0) {
      paymentMethod.isDefault = true;
    }

    return this.paymentMethodRepository.save(paymentMethod);
  }

  async getPaymentHistory(userId: string, page: number = 1) {
    const limit = 20;
    const skip = (page - 1) * limit;

    const [payments, total] = await this.paymentRepository.findAndCount({
      where: { userId },
      relations: ['invoice', 'invoice.order'],
      order: { paidAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      payments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
}