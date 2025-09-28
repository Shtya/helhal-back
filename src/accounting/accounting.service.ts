import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, DataSource, In } from 'typeorm';
import { UserBalance, Transaction, PaymentMethod, User, Order, TransactionStatus, PaymentMethodType, PaymentStatus, Invoice, Setting, Wallet, Notification, UserBillingInfo, UserBankAccount } from 'entities/global.entity';

type ReverseResolutionInput = {
  orderId: string;
  sellerId: string;
  buyerId: string;
  sellerAmount: number; // what was paid out to seller
  buyerRefund: number; // what was refunded to buyer
  sellerPayoutTxId?: string | null; // tx id returned by releaseEscrowSplit for seller payout
  buyerRefundTxId?: string | null; // tx id returned by releaseEscrowSplit for buyer refund
};

type ReleaseSplitResult = {
  sellerPayoutTxId?: string | null;
  buyerRefundTxId?: string | null;
};

@Injectable()
export class AccountingService {
  constructor(
    @InjectRepository(UserBalance) private userBalanceRepository: Repository<UserBalance>,
    @InjectRepository(Transaction) private transactionRepository: Repository<Transaction>,
    @InjectRepository(PaymentMethod) private paymentMethodRepository: Repository<PaymentMethod>,
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(Order) private orderRepository: Repository<Order>,
    @InjectRepository(Invoice) private invoiceRepo: Repository<Invoice>,
    @InjectRepository(Setting) private settingRepo: Repository<Setting>,
    @InjectRepository(Wallet) private walletRepo: Repository<Wallet>,
    @InjectRepository(Notification) private notifRepo: Repository<Notification>,
    @InjectRepository(UserBillingInfo)
    private userBillingInfoRepository: Repository<UserBillingInfo>,

    @InjectRepository(UserBankAccount)
    private userBankAccountRepository: Repository<UserBankAccount>,
    private readonly dataSource: DataSource,
  ) {}

  async getBillingInformation(userId: string) {
    let billingInfo = await this.userBillingInfoRepository.findOne({
      where: { userId },
    });

    if (!billingInfo) {
      // Create default billing info if none exists
      const user = await this.userRepository.findOne({ where: { id: userId } });
      billingInfo = this.userBillingInfoRepository.create({
        userId,
        fullName: user?.username || '',
        country: '',
        state: '',
        isSaudiResident: null,
        agreeToInvoiceEmails: false,
      });
      await this.userBillingInfoRepository.save(billingInfo);
    }

    return billingInfo;
  }

  async updateBillingInformation(userId: string, billingInfoData: any) {
    let billingInfo:any = await this.userBillingInfoRepository.findOne({
      where: { userId },
    });

    if (!billingInfo) {
      billingInfo = this.userBillingInfoRepository.create({
        userId,
        ...billingInfoData,
      });
    } else {
      Object.assign(billingInfo, billingInfoData);
    }

    return this.userBillingInfoRepository.save(billingInfo);
  }

  // Bank Account Methods
  async getBankAccounts(userId: string) {
    return this.userBankAccountRepository.find({
      where: { userId },
      order: { isDefault: 'DESC', created_at: 'DESC' },
    });
  }

  async createBankAccount(userId: string, bankAccountData: any) {
    const bankAccounts = await this.getBankAccounts(userId);

    const bankAccount:any = this.userBankAccountRepository.create({
      userId,
      ...bankAccountData,
    });

    // If this is the first bank account, set it as default
    if (bankAccounts.length === 0) {
      bankAccount.isDefault = true;
    }

    return this.userBankAccountRepository.save(bankAccount);
  }

  async updateBankAccount(userId: string, id: string, bankAccountData: any) {
    const bankAccount = await this.userBankAccountRepository.findOne({
      where: { id, userId },
    });

    if (!bankAccount) {
      throw new NotFoundException('Bank account not found');
    }

    Object.assign(bankAccount, bankAccountData);
    return this.userBankAccountRepository.save(bankAccount);
  }

  async deleteBankAccount(userId: string, id: string) {
    const bankAccount = await this.userBankAccountRepository.findOne({
      where: { id, userId },
    });

    if (!bankAccount) {
      throw new NotFoundException('Bank account not found');
    }

    if (bankAccount.isDefault) {
      throw new BadRequestException('Cannot delete default bank account');
    }

    return this.userBankAccountRepository.remove(bankAccount);
  }

  async setDefaultBankAccount(userId: string, id: string) {
    // Start transaction to ensure only one default account
    return this.dataSource.transaction(async manager => {
      // Remove default from all accounts
      await manager.getRepository(UserBankAccount).update({ userId }, { isDefault: false });

      // Set new default
      await manager.getRepository(UserBankAccount).update({ id, userId }, { isDefault: true });

      return { message: 'Default bank account updated successfully' };
    });
  }

  // Add these methods to your AccountingService

  async getBillingHistory(userId: string, page: number = 1, search?: string, startDate?: string, endDate?: string) {
    const limit = 15;
    const skip = (page - 1) * limit;

    let query = this.transactionRepository.createQueryBuilder('transaction').leftJoinAndSelect('transaction.order', 'order').where('transaction.userId = :userId', { userId }).orderBy('transaction.created_at', 'DESC').skip(skip).take(limit);

    // Add search filter
    if (search) {
      query = query.andWhere('(order.id LIKE :search OR transaction.description LIKE :search)', { search: `%${search}%` });
    }

    // Add date filter
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // End of day

      query = query.andWhere('transaction.created_at BETWEEN :start AND :end', {
        start,
        end,
      });
    }

    const [transactions, total] = await query.getManyAndCount();

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

  async getAvailableBalances(userId: string) {
    const balance = await this.getUserBalance(userId);

    // Get recent transactions for credits calculation
    const recentCredits = await this.transactionRepository.find({
      where: {
        userId,
        type: In(['refund', 'credit']),
        status: TransactionStatus.COMPLETED,
      },
      order: { created_at: 'DESC' },
      take: 10,
    });

    const totalCredits = recentCredits.reduce((sum, tx) => sum + tx.amount, 0);

    return {
      earningsToDate: balance.earningsToDate,
      availableBalance: balance.availableBalance,
      credits: balance.credits,
      recentCredits,
    };
  }

 
  // ────────────────────────────────────────────────────────────────────────────
  // Escrow hold (into platform)
  // ────────────────────────────────────────────────────────────────────────────
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

    await this.transactionRepository.save(
      this.transactionRepository.create({
        userId: platformUserId,
        type: 'escrow_deposit',
        amount,
        description: `Escrow deposit for order #${orderId}`,
        status: TransactionStatus.COMPLETED,
        orderId,
        currencyId: 'SAR',
      }),
    );

    let platformWallet = await this.walletRepo.findOne({ where: { userId: platformUserId } });
    if (!platformWallet) {
      platformWallet = this.walletRepo.create({
        userId: platformUserId,
        balance: 0,
        currency: 'SAR',
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

  // ────────────────────────────────────────────────────────────────────────────
  // Escrow release 100% to seller
  // ────────────────────────────────────────────────────────────────────────────
  async releaseEscrow(orderId: string) {
    const inv = await this.invoiceRepo.findOne({ where: { orderId }, relations: ['order'] });
    if (!inv) throw new NotFoundException('Invoice not found');

    const settings = await this.settingRepo.find({ take: 1, order: { created_at: 'DESC' } });
    const platformUserId = settings?.[0]?.platformAccountUserId;
    if (!platformUserId) throw new BadRequestException('Platform account is not configured');

    const subtotal = Number(inv.subtotal);
    const platformBalance = await this.getUserBalance(platformUserId);
    if (Number(platformBalance.availableBalance) < subtotal) throw new BadRequestException('Escrow insufficient');

    let platformWallet = await this.walletRepo.findOne({ where: { userId: platformUserId } });
    if (!platformWallet) platformWallet = this.walletRepo.create({ userId: platformUserId, balance: 0, currency: 'SAR' });

    // 1) debit platform escrow & wallet
    platformBalance.availableBalance = Number(platformBalance.availableBalance) - subtotal;
    platformWallet.balance = Number(platformWallet.balance) - subtotal;

    // 2) credit seller
    const sellerBalance = await this.getUserBalance(inv.order.sellerId);
    sellerBalance.availableBalance = Number(sellerBalance.availableBalance) + subtotal;
    sellerBalance.earningsToDate = Number(sellerBalance.earningsToDate) + subtotal;

    await this.userBalanceRepository.save([platformBalance, sellerBalance]);
    await this.walletRepo.save(platformWallet);

    await this.transactionRepository.save([
      this.transactionRepository.create({
        userId: platformUserId,
        type: 'escrow_release',
        amount: -subtotal,
        description: `Escrow release to seller for order #${orderId}`,
        status: TransactionStatus.COMPLETED,
        orderId,
        currencyId: 'SAR',
      }),
      this.transactionRepository.create({
        userId: inv.order.sellerId,
        type: 'earning',
        amount: subtotal,
        description: `Payout for order #${orderId}`,
        status: TransactionStatus.COMPLETED,
        orderId,
        currencyId: 'SAR',
      }),
    ]);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Escrow release with split (seller payout + buyer refund)
  // ────────────────────────────────────────────────────────────────────────────
  async releaseEscrowSplit(orderId: string, sellerAmount: number, buyerRefund: number): Promise<ReleaseSplitResult> {
    const inv = await this.invoiceRepo.findOne({ where: { orderId }, relations: ['order'] });
    if (!inv) throw new NotFoundException('Invoice not found');

    const settings = await this.settingRepo.find({ take: 1, order: { created_at: 'DESC' } });
    const platformUserId = settings?.[0]?.platformAccountUserId;
    if (!platformUserId) throw new BadRequestException('Platform account is not configured');

    const subtotal = Number(inv.subtotal);
    if (Math.round((sellerAmount + buyerRefund) * 100) !== Math.round(subtotal * 100)) {
      throw new BadRequestException('Split must equal subtotal');
    }

    const platformBalance = await this.getUserBalance(platformUserId);
    if (Number(platformBalance.availableBalance) < subtotal) throw new BadRequestException('Escrow insufficient');

    let platformWallet = await this.walletRepo.findOne({ where: { userId: platformUserId } });
    if (!platformWallet) platformWallet = this.walletRepo.create({ userId: platformUserId, balance: 0, currency: 'SAR' });

    // move out from platform escrow + wallet
    platformBalance.availableBalance = Number(platformBalance.availableBalance) - subtotal;
    platformWallet.balance = Number(platformWallet.balance) - subtotal;

    const txs: Transaction[] = [
      this.transactionRepository.create({
        userId: platformUserId,
        type: 'escrow_release',
        amount: -subtotal,
        description: `Escrow split for order #${orderId} (seller ${sellerAmount}, buyer refund ${buyerRefund})`,
        status: TransactionStatus.COMPLETED,
        orderId,
        currencyId: 'SAR',
      }),
    ];
    const balancesToSave: UserBalance[] = [platformBalance];

    let sellerTxId: string | null = null;
    let buyerTxId: string | null = null;

    if (sellerAmount > 0) {
      const sellerBal = await this.getUserBalance(inv.order.sellerId);
      sellerBal.availableBalance = Number(sellerBal.availableBalance) + sellerAmount;
      sellerBal.earningsToDate = Number(sellerBal.earningsToDate) + sellerAmount;
      balancesToSave.push(sellerBal);
      const sellerTx = this.transactionRepository.create({
        userId: inv.order.sellerId,
        type: 'earning',
        amount: sellerAmount,
        description: `Dispute payout for order #${orderId}`,
        status: TransactionStatus.COMPLETED,
        orderId,
        currencyId: 'SAR',
      });
      txs.push(sellerTx);
      // We'll know id after save
    }

    if (buyerRefund > 0) {
      const buyerBal = await this.getUserBalance(inv.order.buyerId);
      buyerBal.credits = Number(buyerBal.credits) + buyerRefund;
      buyerBal.cancelledOrdersCredit = Number(buyerBal.cancelledOrdersCredit) + buyerRefund;
      balancesToSave.push(buyerBal);
      const buyerTx = this.transactionRepository.create({
        userId: inv.order.buyerId,
        type: 'refund',
        amount: buyerRefund,
        description: `Dispute refund for order #${orderId}`,
        status: TransactionStatus.COMPLETED,
        orderId,
        currencyId: 'SAR',
      });
      txs.push(buyerTx);
    }

    await this.userBalanceRepository.save(balancesToSave);
    await this.walletRepo.save(platformWallet);
    const savedTxs = await this.transactionRepository.save(txs);

    // map the real ids back
    const sellerTx = savedTxs.find(t => t.userId === inv.order.sellerId && t.type === 'earning' && t.orderId === orderId);
    const buyerTx = savedTxs.find(t => t.userId === inv.order.buyerId && t.type === 'refund' && t.orderId === orderId);
    sellerTxId = sellerTx?.id ?? null;
    buyerTxId = buyerTx?.id ?? null;

    return { sellerPayoutTxId: sellerTxId, buyerRefundTxId: buyerTxId };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Reverse a previously applied resolution (send funds back to platform escrow)
  // ────────────────────────────────────────────────────────────────────────────
  async reverseResolution(input: ReverseResolutionInput): Promise<{
    escrowCreditTxId: string;
    sellerDebitTxId?: string | null;
    buyerDebitTxId?: string | null;
  }> {
    const { orderId, sellerId, buyerId, sellerAmount, buyerRefund } = input;

    if (sellerAmount < 0 || buyerRefund < 0) {
      throw new BadRequestException('Amounts must be >= 0');
    }
    const total = Number((Number(sellerAmount) + Number(buyerRefund)).toFixed(2));
    if (total <= 0) {
      // nothing to reverse
      return { escrowCreditTxId: '' };
    }

    const inv = await this.invoiceRepo.findOne({ where: { orderId }, relations: ['order'] });
    if (!inv) throw new NotFoundException('Invoice not found');

    const settings = await this.settingRepo.find({ take: 1, order: { created_at: 'DESC' } });
    const platformUserId = settings?.[0]?.platformAccountUserId;
    if (!platformUserId) throw new BadRequestException('Platform account is not configured');

    return this.dataSource.transaction(async manager => {
      // Load / create platform wallet
      let platformWallet = await manager.getRepository(Wallet).findOne({ where: { userId: platformUserId } });
      if (!platformWallet) {
        platformWallet = manager.getRepository(Wallet).create({ userId: platformUserId, balance: 0, currency: 'SAR' });
      }

      // 1) credit platform escrow & wallet
      const platformBalance = await manager.getRepository(UserBalance).findOne({ where: { userId: platformUserId } });
      if (!platformBalance) {
        // if escrow was never opened, create it now with 0 then credit
        const fresh = manager.getRepository(UserBalance).create({
          userId: platformUserId,
          availableBalance: 0,
          credits: 0,
          earningsToDate: 0,
          cancelledOrdersCredit: 0,
        });
        await manager.getRepository(UserBalance).save(fresh);
      }
      const escrowBal = await manager.getRepository(UserBalance).findOne({ where: { userId: platformUserId } });
      escrowBal.availableBalance = Number(escrowBal.availableBalance) + total;
      platformWallet.balance = Number(platformWallet.balance) + total;

      // platform ledger row
      const escrowTx = manager.getRepository(Transaction).create({
        userId: platformUserId,
        type: 'escrow_deposit',
        amount: total,
        description: `Reverse dispute: funds returned to escrow for order #${orderId}`,
        status: TransactionStatus.COMPLETED,
        orderId,
        currencyId: 'SAR',
      });

      // 2) debit seller (reverse payout) if any
      let sellerDebitTx: Transaction | null = null;
      if (sellerAmount > 0) {
        const sellerBal = await this.getUserBalanceTx(manager, sellerId);
        sellerBal.availableBalance = Number(sellerBal.availableBalance) - Number(sellerAmount);
        sellerBal.earningsToDate = Number(sellerBal.earningsToDate) - Number(sellerAmount);
        await manager.getRepository(UserBalance).save(sellerBal);

        sellerDebitTx = manager.getRepository(Transaction).create({
          userId: sellerId,
          type: 'earning_reversal', // negative earning
          amount: -Number(sellerAmount),
          description: `Reversal of dispute payout for order #${orderId}`,
          status: TransactionStatus.COMPLETED,
          orderId,
          currencyId: 'SAR',
        });
      }

      // 3) debit buyer (reverse refund) if any
      let buyerDebitTx: Transaction | null = null;
      if (buyerRefund > 0) {
        const buyerBal = await this.getUserBalanceTx(manager, buyerId);
        buyerBal.credits = Number(buyerBal.credits) - Number(buyerRefund);
        buyerBal.cancelledOrdersCredit = Number(buyerBal.cancelledOrdersCredit) - Number(buyerRefund);
        await manager.getRepository(UserBalance).save(buyerBal);

        buyerDebitTx = manager.getRepository(Transaction).create({
          userId: buyerId,
          type: 'refund_reversal', // negative refund
          amount: -Number(buyerRefund),
          description: `Reversal of dispute refund for order #${orderId}`,
          status: TransactionStatus.COMPLETED,
          orderId,
          currencyId: 'SAR',
        });
      }

      // save updated platform balances + wallet + transactions
      await manager.getRepository(UserBalance).save(escrowBal);
      await manager.getRepository(Wallet).save(platformWallet);

      const saved = await manager.getRepository(Transaction).save([escrowTx, sellerDebitTx, buyerDebitTx].filter(Boolean) as Transaction[]);

      const escrowCreditTxId = saved.find(t => t.userId === platformUserId && t.type === 'escrow_deposit')?.id || '';

      const sellerDebitTxId = sellerDebitTx ? saved.find(t => t.userId === sellerId && t.type === 'earning_reversal' && t.orderId === orderId)?.id || null : null;

      const buyerDebitTxId = buyerDebitTx ? saved.find(t => t.userId === buyerId && t.type === 'refund_reversal' && t.orderId === orderId)?.id || null : null;

      // Notifications (platform, seller, buyer)
      await manager.getRepository(Notification).save(
        [
          manager.getRepository(Notification).create({
            userId: platformUserId,
            type: 'escrow_reversal',
            title: 'Escrow credited (reversal)',
            message: `Funds returned to platform escrow for order #${orderId}.`,
            relatedEntityType: 'order',
            relatedEntityId: orderId,
          }) as any,
          sellerAmount > 0
            ? (manager.getRepository(Notification).create({
                userId: sellerId,
                type: 'payout_reversed',
                title: 'Payout reversed',
                message: `Your previous payout for order #${orderId} was reversed back to escrow.`,
                relatedEntityType: 'order',
                relatedEntityId: orderId,
              }) as any)
            : null,
          buyerRefund > 0
            ? (manager.getRepository(Notification).create({
                userId: buyerId,
                type: 'refund_reversed',
                title: 'Refund reversed',
                message: `Your previous refund for order #${orderId} was reversed back to escrow.`,
                relatedEntityType: 'order',
                relatedEntityId: orderId,
              }) as any)
            : null,
        ].filter(Boolean) as any[],
      );

      return { escrowCreditTxId, sellerDebitTxId, buyerDebitTxId };
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Balances & helpers
  // ────────────────────────────────────────────────────────────────────────────
  async getUserBalance(userId: string) {
    let balance = await this.userBalanceRepository.findOne({ where: { userId } });
    if (!balance) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');
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

  // same as getUserBalance but within a transaction
  private async getUserBalanceTx(manager, userId: string) {
    let balance = await manager.getRepository(UserBalance).findOne({ where: { userId } });
    if (!balance) {
      const user = await manager.getRepository(User).findOne({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');
      balance = manager.getRepository(UserBalance).create({
        userId,
        availableBalance: 0,
        credits: 0,
        earningsToDate: 0,
        cancelledOrdersCredit: 0,
      });
      await manager.getRepository(UserBalance).save(balance);
    }
    return balance;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // (Everything below left unchanged)
  // ────────────────────────────────────────────────────────────────────────────
  async getUserTransactions(userId: string, page: number = 1, type?: string) {
    const limit = 20;
    const skip = (page - 1) * limit;

    const whereClause: any = { userId };
    if (type) whereClause.type = type;

    const [transactions, total] = await this.transactionRepository.findAndCount({
      where: whereClause,
      relations: ['order'],
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return {
      transactions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async withdrawFunds(userId: string, amount: number, paymentMethodId: string) {
    if (amount <= 0) throw new BadRequestException('Invalid withdrawal amount');

    const balance = await this.getUserBalance(userId);
    if (balance.availableBalance < amount) throw new BadRequestException('Insufficient funds');

    const paymentMethod = await this.paymentMethodRepository.findOne({ where: { id: paymentMethodId, userId } });
    if (!paymentMethod) throw new NotFoundException('Payment method not found');

    const transaction = this.transactionRepository.create({
      userId,
      type: 'withdrawal',
      amount: -amount,
      description: `Withdrawal to ${paymentMethod.methodType}`,
      status: TransactionStatus.PENDING,
    });

    balance.availableBalance -= amount;
    await this.userBalanceRepository.save(balance);

    const savedTransaction = await this.transactionRepository.save(transaction);

    setTimeout(async () => {
      savedTransaction.status = TransactionStatus.COMPLETED;
      await this.transactionRepository.save(savedTransaction);
    }, 5000);

    return { message: 'Withdrawal request submitted', transaction: savedTransaction };
  }

  async getUserPaymentMethods(userId: string) {
    return this.paymentMethodRepository.find({ where: { userId }, order: { isDefault: 'DESC', created_at: 'DESC' } });
  }

  async addPaymentMethod(userId: string, paymentMethodData: any) {
    const paymentMethod: any = this.paymentMethodRepository.create({ ...paymentMethodData, userId });
    const existingMethods = await this.getUserPaymentMethods(userId);
    if (existingMethods.length === 0) paymentMethod.isDefault = true;
    return this.paymentMethodRepository.save(paymentMethod);
  }

  async removePaymentMethod(userId: string, paymentMethodId: string) {
    const paymentMethod = await this.paymentMethodRepository.findOne({ where: { id: paymentMethodId, userId } });
    if (!paymentMethod) throw new NotFoundException('Payment method not found');
    if (paymentMethod.isDefault) throw new BadRequestException('Cannot remove default payment method');
    return this.paymentMethodRepository.remove(paymentMethod);
  }

  async getEarningsReport(userId: string, startDate: string, endDate: string) {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const earnings = await this.transactionRepository.find({
      where: { userId, type: 'earning', status: TransactionStatus.COMPLETED, created_at: Between(start, end) },
    });
    const withdrawals = await this.transactionRepository.find({
      where: { userId, type: 'withdrawal', status: TransactionStatus.COMPLETED, created_at: Between(start, end) },
    });

    const totalEarnings = earnings.reduce((s, t) => s + t.amount, 0);
    const totalWithdrawals = withdrawals.reduce((s, t) => s + Math.abs(t.amount), 0);
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
    const order = await this.orderRepository.findOne({ where: { id: orderId }, relations: ['buyer', 'seller'] });
    if (!order) throw new NotFoundException('Order not found');

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
    const order = await this.orderRepository.findOne({ where: { id: orderId }, relations: ['buyer', 'seller'] });
    if (!order) throw new NotFoundException('Order not found');

    const sellerBalance = await this.getUserBalance(order.sellerId);
    sellerBalance.availableBalance -= refundAmount;
    sellerBalance.earningsToDate -= refundAmount;
    await this.userBalanceRepository.save(sellerBalance);

    const buyerBalance = await this.getUserBalance(order.buyerId);
    buyerBalance.credits += refundAmount;
    buyerBalance.cancelledOrdersCredit += refundAmount;
    await this.userBalanceRepository.save(buyerBalance);

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

  async processWithdrawalAdmin(id: string, action: 'approve' | 'reject') {
    const tx = await this.transactionRepository.findOne({ where: { id, type: 'withdrawal' } });
    if (!tx) throw new NotFoundException('Withdrawal not found');
    if (tx.status !== 'PENDING') throw new BadRequestException('Only pending withdrawals can be processed');

    if (action === 'approve') {
      tx.status = 'COMPLETED';
      return this.transactionRepository.save(tx);
    } else {
      tx.status = 'REJECTED';
      const bal = await this.getUserBalance(tx.userId);
      bal.availableBalance += Math.abs(tx.amount); // amount is negative
      await this.userBalanceRepository.save(bal);
      return this.transactionRepository.save(tx);
    }
  }

  async listWithdrawalsAdmin(page = 1, status?: string) {
    const limit = 20;
    const skip = (page - 1) * limit;
    const where: any = { type: 'withdrawal' };
    if (status) where.status = status;

    const [transactions, total] = await this.transactionRepository.findAndCount({
      where,
      relations: ['order', 'user'],
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return { transactions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }
}
