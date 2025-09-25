import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { UserBalance, Transaction, PaymentMethod, User, Order, TransactionStatus, PaymentMethodType, PaymentStatus, Invoice, Setting, Wallet, Notification } from 'entities/global.entity';

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
    @InjectRepository(Invoice) private invoiceRepo: Repository<Invoice>,
    @InjectRepository(Setting) private settingRepo: Repository<Setting>,
    @InjectRepository(Wallet) private walletRepo: Repository<Wallet>,
    @InjectRepository(Notification) private notifRepo: Repository<Notification>,
  ) {}

  // save the money in the platform wallet and notification to the admin
  async holdEscrow(orderId: string) {
    const inv = await this.invoiceRepo.findOne({ where: { orderId }, relations: ['order'] });
    if (!inv || inv.paymentStatus !== PaymentStatus.PAID) {
      throw new BadRequestException('Invoice not paid');
    }

     const settings = await this.settingRepo.find({ take: 1, order: { created_at: 'DESC' } });
    const platformUserId = settings?.[0]?.platformAccountUserId;
    if (!platformUserId) throw new BadRequestException('Platform account is not configured');

    const amount = Number(inv.totalAmount);

    const platformBalance = await this.getUserBalance(platformUserId);
    platformBalance.availableBalance = Number(platformBalance.availableBalance) + amount;
    await this.userBalanceRepository.save(platformBalance);

    // 2) معاملة سجلية للمنصّة
    await this.transactionRepository.save(
      this.transactionRepository.create({
        userId: platformUserId,
        type: 'escrow_deposit',
        amount,
        description: `Escrow deposit for order #${orderId}`,
        status: TransactionStatus.COMPLETED,
        orderId,
        currencyId: 'SAR', // غيّرها لو عندك عملة مختلفة
      }),
    );

    // 3) **محفظة Wallet** للمنصّة ← زوّد الرصيد
    let platformWallet = await this.walletRepo.findOne({ where: { userId: platformUserId } });
    if (!platformWallet) {
      platformWallet = this.walletRepo.create({
        userId: platformUserId,
        balance: 0,
        currency: 'SAR', // حط العملة المناسبة، إفتراضيًا كانت USD في الـ Entity
      });
    }
    platformWallet.balance = Number(platformWallet.balance) + amount;
    await this.walletRepo.save(platformWallet);

    await this.notifRepo.save(
      this.notifRepo.create({
        userId: platformUserId,
        type: 'escrow_deposit',
        title: 'Funds received into the platform wallet',
        message: `The platform has received ${amount} SAR for order "${inv.order?.title || orderId}".`,
        relatedEntityType: 'order',
        relatedEntityId: orderId,
      }),
    );
  }

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
    const paymentMethod: any = this.paymentMethodRepository.create({
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
      description: `Refund for order #${orderId}`,
      status: TransactionStatus.COMPLETED,
      orderId,
    });

    const buyerRefundTransaction = this.transactionRepository.create({
      userId: order.buyerId,
      type: 'refund',
      amount: refundAmount,
      description: `Refund for order #${orderId}`,
      status: TransactionStatus.COMPLETED,
      orderId,
    });

    await this.transactionRepository.save([sellerRefundTransaction, buyerRefundTransaction]);

    return { success: true };
  }

  // Money leaves platform wallet to seller on completion (subtotal only); fee stays
  async releaseEscrow(orderId: string) {
    const inv = await this.invoiceRepo.findOne({ where: { orderId }, relations: ['order'] });
    if (!inv) throw new NotFoundException('Invoice not found');

    const settings = await this.settingRepo.find({ take: 1, order: { created_at: 'DESC' } });
    const platformUserId = settings?.[0]?.platformAccountUserId;
    if (!platformUserId) throw new BadRequestException('Platform account is not configured');

    const subtotal = Number(inv.subtotal);
    const serviceFee = Number(inv.serviceFee);

    const platformBalance = await this.getUserBalance(platformUserId);
    if (platformBalance.availableBalance < subtotal) throw new BadRequestException('Escrow insufficient');

    // debit platform escrow by subtotal
    platformBalance.availableBalance -= subtotal;
    await this.userBalanceRepository.save(platformBalance);

    // credit seller
    const order = inv.order;
    const sellerBalance = await this.getUserBalance(order.sellerId);
    sellerBalance.availableBalance += subtotal;
    sellerBalance.earningsToDate += subtotal;
    await this.userBalanceRepository.save(sellerBalance);

    // transactions
    await this.transactionRepository.save([
      this.transactionRepository.create({
        userId: platformUserId,
        type: 'escrow_release',
        amount: -subtotal,
        description: `Escrow release to seller for order #${orderId}`,
        status: TransactionStatus.COMPLETED,
        orderId,
      }),
      this.transactionRepository.create({
        userId: order.sellerId,
        type: 'earning',
        amount: subtotal,
        description: `Payout for order #${orderId}`,
        status: TransactionStatus.COMPLETED,
        orderId,
      }),
    ]);
  }

  async processWithdrawalAdmin(id: string, action: 'approve' | 'reject') {
    const tx = await this.transactionRepository.findOne({ where: { id, type: 'withdrawal' } });
    if (!tx) throw new NotFoundException('Withdrawal not found');
    if (tx.status !== 'PENDING') throw new BadRequestException('Only pending withdrawals can be processed');

    if (action === 'approve') {
      tx.status = 'COMPLETED';
      // initiate actual payout here
      return this.transactionRepository.save(tx);
    } else {
      tx.status = 'REJECTED';
      // refund user balance since withdrawal is cancelled
      const bal = await this.getUserBalance(tx.userId);
      bal.availableBalance += Math.abs(tx.amount); // amount is negative in your model
      await this.userBalanceRepository.save(bal);
      return this.transactionRepository.save(tx);
    }
  }

  async listWithdrawalsAdmin(page = 1, status?: string) {
    const limit = 20;
    const skip = (page - 1) * limit;
    const where: any = { type: 'withdrawal' };
    if (status) where.status = status; // PENDING | COMPLETED | REJECTED

    const [transactions, total] = await this.transactionRepository.findAndCount({
      where,
      relations: ['order', 'user'], // if you have user relation; else store username on tx
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return { transactions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }
}
