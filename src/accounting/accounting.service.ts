import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { UserBalance, Transaction, PaymentMethod, User, Order, TransactionStatus, PaymentMethodType } from 'entities/global.entity';

@Injectable()
export class AccountingService {
  constructor(
    @InjectRepository(UserBalance)
    private userBalanceRepository: Repository<UserBalance>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(PaymentMethod)
    private paymentMethodRepository: Repository<PaymentMethod>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) {}

  async getUserBalance(userId: string) {
    let balance = await this.userBalanceRepository.findOne({ where: { userId } });

    if (!balance) {
      // Create balance record if it doesn't exist
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      balance = this.userBalanceRepository.create({
        userId,
        availableBalance: 0,
        credits: 0,
        earningsToDate: 0,
        cancelledOrdersCredit: 0,
      });

      await this.userBalanceRepository.save(balance);
    }

    return balance;
  }

  async getUserTransactions(userId: string, page: number = 1, type?: string) {
    const limit = 20;
    const skip = (page - 1) * limit;

    const whereClause: any = { userId };
    if (type) {
      whereClause.type = type;
    }

    const [transactions, total] = await this.transactionRepository.findAndCount({
      where: whereClause,
      relations: ['order'],
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return {
      transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async withdrawFunds(userId: string, amount: number, paymentMethodId: string) {
    if (amount <= 0) {
      throw new BadRequestException('Invalid withdrawal amount');
    }

    const balance = await this.getUserBalance(userId);
    if (balance.availableBalance < amount) {
      throw new BadRequestException('Insufficient funds');
    }

    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { id: paymentMethodId, userId },
    });

    if (!paymentMethod) {
      throw new NotFoundException('Payment method not found');
    }

    // Create withdrawal transaction
    const transaction = this.transactionRepository.create({
      userId,
      type: 'withdrawal',
      amount: -amount, // Negative amount for withdrawal
      currencyId: 'USD',
      description: `Withdrawal to ${paymentMethod.methodType}`,
      status: TransactionStatus.PENDING,
    });

    // Update balance
    balance.availableBalance -= amount;
    await this.userBalanceRepository.save(balance);

    const savedTransaction = await this.transactionRepository.save(transaction);

    // In a real implementation, you would integrate with a payment processor here
    // For now, we'll simulate a successful withdrawal after a delay
    setTimeout(async () => {
      savedTransaction.status = TransactionStatus.COMPLETED;
      await this.transactionRepository.save(savedTransaction);
    }, 5000);

    return { message: 'Withdrawal request submitted', transaction: savedTransaction };
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

  async removePaymentMethod(userId: string, paymentMethodId: string) {
    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { id: paymentMethodId, userId },
    });

    if (!paymentMethod) {
      throw new NotFoundException('Payment method not found');
    }

    if (paymentMethod.isDefault) {
      throw new BadRequestException('Cannot remove default payment method');
    }

    return this.paymentMethodRepository.remove(paymentMethod);
  }

  async getEarningsReport(userId: string, startDate: string, endDate: string) {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: last 30 days
    const end = endDate ? new Date(endDate) : new Date();

    // Get earnings transactions
    const earnings = await this.transactionRepository.find({
      where: {
        userId,
        type: 'earning',
        status: TransactionStatus.COMPLETED,
        created_at: Between(start, end),
      },
    });

    // Get withdrawal transactions
    const withdrawals = await this.transactionRepository.find({
      where: {
        userId,
        type: 'withdrawal',
        status: TransactionStatus.COMPLETED,
        created_at: Between(start, end),
      },
    });

    // Calculate totals
    const totalEarnings = earnings.reduce((sum, t) => sum + t.amount, 0);
    const totalWithdrawals = withdrawals.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const netEarnings = totalEarnings - totalWithdrawals;

    return {
      period: { start, end },
      totalEarnings,
      totalWithdrawals,
      netEarnings,
      transactions: [...earnings, ...withdrawals].sort((a, b) => b.created_at.getTime() - a.created_at.getTime()),
    };
  }

  async processOrderPayment(orderId: string) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['buyer', 'seller'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Update seller's balance
    let sellerBalance = await this.userBalanceRepository.findOne({ where: { userId: order.sellerId } });
    if (!sellerBalance) {
      sellerBalance = this.userBalanceRepository.create({
        userId: order.sellerId,
        availableBalance: 0,
        credits: 0,
        earningsToDate: 0,
        cancelledOrdersCredit: 0,
      });
    }

    sellerBalance.availableBalance += order.totalAmount;
    sellerBalance.earningsToDate += order.totalAmount;
    await this.userBalanceRepository.save(sellerBalance);

    // Create earning transaction for seller
    const earningTransaction = this.transactionRepository.create({
      userId: order.sellerId,
      type: 'earning',
      amount: order.totalAmount,
      currencyId: 'USD',
      description: `Earnings from order #${orderId}`,
      status: TransactionStatus.COMPLETED,
      orderId,
    });

    await this.transactionRepository.save(earningTransaction);

    return { success: true };
  }

  async processRefund(orderId: string, refundAmount: number) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['buyer', 'seller'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Update seller's balance (deduct refund)
    const sellerBalance = await this.getUserBalance(order.sellerId);
    sellerBalance.availableBalance -= refundAmount;
    sellerBalance.earningsToDate -= refundAmount;
    await this.userBalanceRepository.save(sellerBalance);

    // Update buyer's balance (add refund credit)
    const buyerBalance = await this.getUserBalance(order.buyerId);
    buyerBalance.credits += refundAmount;
    buyerBalance.cancelledOrdersCredit += refundAmount;
    await this.userBalanceRepository.save(buyerBalance);

    // Create refund transactions
    const sellerRefundTransaction = this.transactionRepository.create({
      userId: order.sellerId,
      type: 'refund',
      amount: -refundAmount,
      currencyId: 'USD',
      description: `Refund for order #${orderId}`,
      status: TransactionStatus.COMPLETED,
      orderId,
    });

    const buyerRefundTransaction = this.transactionRepository.create({
      userId: order.buyerId,
      type: 'refund',
      amount: refundAmount,
      currencyId: 'USD',
      description: `Refund for order #${orderId}`,
      status: TransactionStatus.COMPLETED,
      orderId,
    });

    await this.transactionRepository.save([sellerRefundTransaction, buyerRefundTransaction]);

    return { success: true };
  }
}