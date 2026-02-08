import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, DataSource, In, EntityManager } from 'typeorm';
import { UserBalance, Transaction, PaymentMethod, User, Order, TransactionStatus, PaymentStatus, Invoice, Setting, Notification, UserBillingInfo, UserBankAccount, Country, TransactionBillingInfo, State, TransactionType, PlatformWallet } from 'entities/global.entity';
import { PaymentGatewayFactory } from 'src/payments/base/payment.gateway.factory';

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
    @InjectRepository(Country) private countryRepository: Repository<Country>,
    @InjectRepository(State) private stateRepository: Repository<State>,
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(Order) private orderRepository: Repository<Order>,
    @InjectRepository(Invoice) private invoiceRepo: Repository<Invoice>,
    @InjectRepository(Setting) private settingRepo: Repository<Setting>,
    @InjectRepository(PlatformWallet) private platformWalletRepo: Repository<PlatformWallet>,
    @InjectRepository(Notification) private notifRepo: Repository<Notification>,
    @InjectRepository(UserBillingInfo)
    private userBillingInfoRepository: Repository<UserBillingInfo>,
    @InjectRepository(TransactionBillingInfo)
    private transactionBillingRepo: Repository<TransactionBillingInfo>,
    @InjectRepository(UserBankAccount)
    private userBankAccountRepository: Repository<UserBankAccount>,
    private readonly dataSource: DataSource,
    private readonly gatewayFactory: PaymentGatewayFactory,
  ) { }

  async getBillingInformation(userId: string) {
    let billingInfo = await this.userBillingInfoRepository.findOne({
      where: { userId },
      relations: ['country',
        'state',
        'user',
        'user.person'],
    });

    if (!billingInfo) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }


      billingInfo = this.userBillingInfoRepository.create({
        userId,
        firstName: user?.username || '',
        // other fields default to null/empty
      });
      await this.userBillingInfoRepository.save(billingInfo);
    }

    return billingInfo;
  }

  async updateBillingInformation(userId: string, data: any): Promise<UserBillingInfo> {
    // Ensure we find ONE record
    let billingInfo = await this.userBillingInfoRepository.findOne({
      where: { userId: userId }
    });

    const country = await this.countryRepository.findOne({ where: { id: data.countryId } });
    if (!country) throw new NotFoundException('Country not found');

    // 2. Validate State (Ensure it belongs to the selected country)
    const state = await this.stateRepository.findOne({
      where: { id: data.stateId, countryId: data.countryId }
    });


    const updateData = {
      firstName: data.firstName,
      lastName: data.lastName,
      countryId: data.countryId,
      stateId: state ? data.stateId : null, // Now using ID
      ...(data.agreeToInvoiceEmails !== undefined ? { agreeToInvoiceEmails: data.agreeToInvoiceEmails } : {}),
      isSaudiResident: country.iso2 === 'SA',
    };


    if (!billingInfo) {
      // Create new entity if it doesn't exist
      billingInfo = this.userBillingInfoRepository.create({
        ...updateData,
        userId
      });
    } else {
      // Merge new data into existing entity
      Object.assign(billingInfo, updateData);
      billingInfo.userId = userId;
    }
    // Explicitly return the saved entity
    return await this.userBillingInfoRepository.save(billingInfo);
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

    const bankAccount: any = this.userBankAccountRepository.create({
      ...bankAccountData,
      userId

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
    bankAccount.userId = userId;
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

  async getBillingHistory(userId: string, page: number = 1, limit: number = 15, search?: string, startDate?: string, endDate?: string) {

    const skip = (page - 1) * limit;

    let query = this.transactionRepository.createQueryBuilder('transaction').leftJoinAndSelect('transaction.order', 'order').where('transaction.userId = :userId', { userId }).orderBy('transaction.created_at', 'DESC').skip(skip).take(limit);

    // Add search filter
    if (search) {
      query = query.andWhere('(transaction.description LIKE :search)', { search: `%${search}%` });
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

    return {
      id: balance.id,
      userId: balance.userId,
      earningsToDate: balance.earningsToDate,
      availableBalance: balance.availableBalance,
      reservedBalance: balance.reservedBalance,
      promoCredits: balance.promoCredits,
      cancelledOrdersCredit: balance.cancelledOrdersCredit,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Escrow hold (into platform)
  // ────────────────────────────────────────────────────────────────────────────
  async holdEscrow(orderId: string, manager: EntityManager) {
    const invoiceRepo = manager.getRepository(Invoice);
    const settingRepo = manager.getRepository(Setting);
    const platformWalletRepo = manager.getRepository(PlatformWallet);
    const notifRepo = manager.getRepository(Notification);
    const transactionRepo = manager.getRepository(Transaction);

    const inv = await invoiceRepo.findOne({
      where: { orderId },
      relations: ['order'],
    });
    if (!inv || inv.paymentStatus !== PaymentStatus.PAID) {
      throw new BadRequestException('Invoice not paid');
    }

    const settings = await settingRepo.find({ take: 1, order: { created_at: 'DESC' } });
    const platformUserId = settings?.[0]?.platformAccountUserId;
    if (!platformUserId) throw new BadRequestException('Platform account is not configured');

    const amount = Number(inv.totalAmount);

    await transactionRepo.save(
      transactionRepo.create({
        userId: platformUserId,
        type: TransactionType.ESCROW_DEPOSIT,
        amount,
        description: `Escrow deposit for order #${orderId}`,
        status: TransactionStatus.COMPLETED,
        orderId,
        currencyId: 'SAR',
      }),
    );

    let platformWallet = await this.getPlatformWalletTx(manager);
    platformWallet.totalEscrowBalance = Number(platformWallet.totalEscrowBalance) + amount;
    await platformWalletRepo.save(platformWallet);

    await notifRepo.save(
      notifRepo.create({
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
  // Escrow release 100% - seller service fee to seller
  // ────────────────────────────────────────────────────────────────────────────
  async releaseEscrow(orderId: string, manager: EntityManager) {

    const inv = await manager.findOne(Invoice, {
      where: { orderId },
      relations: ['order'],
    });
    if (!inv) throw new NotFoundException('Invoice not found');

    const settings = await manager.find(Setting, { take: 1, order: { created_at: 'DESC' } });
    const platformUserId = settings?.[0]?.platformAccountUserId;
    if (!platformUserId) throw new BadRequestException('Platform account is not configured');

    const fees = (Number(inv.subtotal) * (Number(inv.sellerServiceFee) / 100));
    const netEarnings = Number(inv.subtotal) - fees;

    let platformWallet = await this.getPlatformWalletTx(manager);
    platformWallet.totalEscrowBalance = Number(platformWallet.totalEscrowBalance) - netEarnings;
    platformWallet.platformProfit = Number(platformWallet.platformProfit) + fees + inv.platformPercent;
    // 2) credit seller
    const sellerBalance = await this.getUserBalanceTx(manager, inv.order.sellerId);
    sellerBalance.availableBalance = Number(sellerBalance.availableBalance) + netEarnings;
    sellerBalance.earningsToDate = Number(sellerBalance.earningsToDate) + netEarnings;

    await manager.save([sellerBalance, platformWallet]);

    await manager.save(Transaction, [
      manager.create(Transaction, {
        userId: platformUserId,
        type: TransactionType.ESCROW_RELEASE,
        amount: -netEarnings,
        description: `Escrow release to seller for order #${orderId}`,
        status: TransactionStatus.COMPLETED,
        orderId,
        currencyId: 'SAR',
      }),
      this.transactionRepository.create({
        userId: inv.order.sellerId,
        type: TransactionType.EARNING,
        amount: netEarnings,
        description: `Payout for order #${orderId}`,
        status: TransactionStatus.COMPLETED,
        orderId,
        currencyId: 'SAR',
      }),
    ]);

    return { success: true, releasedAmount: netEarnings }

  }

  // ────────────────────────────────────────────────────────────────────────────
  // Escrow release 100% - platform fee to buyer
  // ────────────────────────────────────────────────────────────────────────────
  async refundEscrowToBuyer(orderId: string, manager: EntityManager) {

    // 1. Fetch Invoice and Order with a lock
    const inv = await manager.findOne(Invoice, {
      where: { orderId },
      relations: ['order'],
    });

    if (!inv) throw new NotFoundException('Invoice not found');
    // Prevent double refunds
    if (inv.paymentStatus !== PaymentStatus.PAID) {
      throw new BadRequestException('Invoice is not in PAID status');
    }

    // 2. Identify Platform Wallet and Buyer Balance
    const platformWallet = await this.getPlatformWalletTx(manager);
    const buyerBalance = await this.getUserBalanceTx(manager, inv.order.buyerId);

    // Get Platform User ID for transaction logging and notifications
    const settings = await manager.find(Setting, { take: 1, order: { created_at: 'DESC' } });
    const platformUserId = settings?.[0]?.platformAccountUserId;

    const refundAmount = Number(inv.totalAmount - inv.platformPercent); // Refund the full escrowed amount

    // 3. Safety Check
    if (Number(platformWallet.totalEscrowBalance) < refundAmount) {
      throw new BadRequestException('Insufficient escrow funds for refund');
    }

    // 4. Update Platform Wallet
    // Deduct the full amount from the escrow pool
    platformWallet.totalEscrowBalance = Number(platformWallet.totalEscrowBalance) - refundAmount;
    platformWallet.platformProfit = Number(platformWallet.platformProfit) + inv.platformPercent;

    // 5. Update Buyer Balance
    // Money goes to availableBalance so they can withdraw or reuse it
    buyerBalance.availableBalance = Number(buyerBalance.availableBalance) + refundAmount;
    // Increment the statistical counter for lifetime refunds received
    buyerBalance.cancelledOrdersCredit = Number(buyerBalance.cancelledOrdersCredit) + refundAmount;

    // 6. Update Invoice Status
    inv.paymentStatus = PaymentStatus.REFUNDED;

    // 7. Save all entities
    await manager.save([platformWallet, buyerBalance, inv]);

    // 8. Record Transactions
    await manager.save(Transaction, [
      // Debit Platform (using platformUserId for record keeping)
      manager.create(Transaction, {
        userId: platformUserId,
        type: TransactionType.REFUND,
        amount: -refundAmount,
        description: `Refund for rejected order #${orderId} - deducted from escrow`,
        status: TransactionStatus.COMPLETED,
        orderId,
        currencyId: 'SAR',
      }),
      // Credit Buyer
      manager.create(Transaction, {
        userId: inv.order.buyerId,
        type: TransactionType.REFUND,
        amount: refundAmount,
        description: `Refund for rejected order #${orderId}`,
        status: TransactionStatus.COMPLETED,
        orderId,
        currencyId: 'SAR',
      }),
    ]);

    return { success: true, refundedAmount: refundAmount };

  }

  // ────────────────────────────────────────────────────────────────────────────
  // Escrow release with split (seller payout + buyer refund)
  // ────────────────────────────────────────────────────────────────────────────

  async releaseEscrowSplit(orderId: string, sellerAmount: number, buyerRefund: number, manager: EntityManager): Promise<ReleaseSplitResult> {
    // 1. Fetch Invoice with lock
    const inv = await manager.findOne(Invoice, {
      where: { orderId },
      relations: ['order'],
    });
    if (!inv) throw new NotFoundException('Invoice not found');

    if (inv.paymentStatus !== PaymentStatus.PAID) {
      throw new BadRequestException('Invoice is not in PAID status');
    }

    const settings = await manager.find(Setting, { take: 1, order: { created_at: 'DESC' } });
    const platformUserId = settings?.[0]?.platformAccountUserId;
    if (!platformUserId) throw new BadRequestException('Platform account is not configured');

    // 2. Validate Split Math
    const subtotal = Number(inv.subtotal);
    // Use a small epsilon check for floating point math
    if (((Number(sellerAmount) + Number(buyerRefund)) - subtotal) > 0.01) {
      throw new BadRequestException('Split must equal subtotal');
    }

    // 3. Calculate Fees and Net for the Seller portion
    // We only take a fee from the amount the seller is actually getting
    const platformFeeOnSellerPart = Number(sellerAmount) * (Number(inv.sellerServiceFee) / 100);
    const sellerNetPay = Number(sellerAmount) - platformFeeOnSellerPart;
    const totalRequiredFromEscrow = Number(buyerRefund + sellerNetPay);
    // 4. Update Platform Wallet (Treasury)
    const platformWallet = await this.getPlatformWalletTx(manager);
    if (Number(platformWallet.totalEscrowBalance) < totalRequiredFromEscrow) throw new BadRequestException('Escrow insufficient');

    // Remove the full original subtotal from Escrow
    platformWallet.totalEscrowBalance = Number(platformWallet.totalEscrowBalance) - totalRequiredFromEscrow;
    // The platform keeps the fee from the seller's portion as profit
    platformWallet.platformProfit = Number(platformWallet.platformProfit) + platformFeeOnSellerPart + inv.platformPercent;

    const txs: Transaction[] = [];
    const entitiesToSave: any[] = [platformWallet];


    // 5. Credit Seller (if they get anything)
    if (sellerNetPay > 0) {
      const sellerBal = await this.getUserBalanceTx(manager, inv.order.sellerId);
      sellerBal.availableBalance = Number(sellerBal.availableBalance) + sellerNetPay;
      sellerBal.earningsToDate = Number(sellerBal.earningsToDate) + sellerNetPay;

      entitiesToSave.push(sellerBal);

      txs.push(manager.create(Transaction, {
        userId: inv.order.sellerId,
        type: TransactionType.EARNING,
        amount: sellerNetPay,
        description: `Dispute payout for order #${orderId}`,
        status: TransactionStatus.COMPLETED,
        orderId,
        currencyId: 'SAR',
      }));
    }

    // 6. Credit Buyer (if they get a refund)
    if (buyerRefund > 0) {
      const buyerBal = await this.getUserBalanceTx(manager, inv.order.buyerId);
      // IMPROVEMENT: Move to availableBalance (withdrawable) and update stats
      buyerBal.availableBalance = Number(buyerBal.availableBalance) + Number(buyerRefund);
      buyerBal.cancelledOrdersCredit = Number(buyerBal.cancelledOrdersCredit) + Number(buyerRefund);

      entitiesToSave.push(buyerBal);

      txs.push(manager.create(Transaction, {
        userId: inv.order.buyerId,
        type: TransactionType.REFUND,
        amount: Number(buyerRefund),
        description: `Dispute refund for order #${orderId}`,
        status: TransactionStatus.COMPLETED,
        orderId,
        currencyId: 'SAR',
      }));
    }

    // 7. Record the Platform's Escrow Release
    txs.push(manager.create(Transaction, {
      userId: platformUserId,
      type: TransactionType.ESCROW_RELEASE,
      amount: -totalRequiredFromEscrow,
      description: `Escrow split release for order #${orderId}`,
      status: TransactionStatus.COMPLETED,
      orderId,
      currencyId: 'SAR',
    }));

    // 8. Finalize Database changes
    await manager.save(entitiesToSave);
    const savedTxs = await manager.save(Transaction, txs);

    // 9. Map IDs for return
    const sTx = savedTxs.find(t => t.userId === inv.order.sellerId && t.type === TransactionType.EARNING);
    const bTx = savedTxs.find(t => t.userId === inv.order.buyerId && t.type === TransactionType.REFUND);

    return {
      sellerPayoutTxId: sTx?.id ?? null,
      buyerRefundTxId: bTx?.id ?? null
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Reverse a previously applied resolution (send funds back to platform escrow)
  // ────────────────────────────────────────────────────────────────────────────
  // async reverseResolution(input: ReverseResolutionInput): Promise<{
  //   escrowCreditTxId: string; sellerDebitTxId?: string | null; buyerDebitTxId?: string | null;
  // }> {
  //   const { orderId, sellerId, buyerId, sellerAmount, buyerRefund } = input;

  //   if (sellerAmount < 0 || buyerRefund < 0) {
  //     throw new BadRequestException('Amounts must be >= 0');
  //   }
  //   const total = Number((Number(sellerAmount) + Number(buyerRefund)).toFixed(2));
  //   if (total <= 0) {
  //     // nothing to reverse
  //     return { escrowCreditTxId: '' };
  //   }

  //   const inv = await this.invoiceRepo.findOne({ where: { orderId }, relations: ['order'] });
  //   if (!inv) throw new NotFoundException('Invoice not found');

  //   const settings = await this.settingRepo.find({ take: 1, order: { created_at: 'DESC' } });
  //   const platformUserId = settings?.[0]?.platformAccountUserId;
  //   if (!platformUserId) throw new BadRequestException('Platform account is not configured');

  //   return this.dataSource.transaction(async manager => {
  //     // Load / create platform wallet
  //     let platformWallet = await manager.getRepository(Wallet).findOne({ where: { userId: platformUserId } });
  //     if (!platformWallet) {
  //       platformWallet = manager.getRepository(Wallet).create({ userId: platformUserId, balance: 0, currency: 'SAR' });
  //     }

  //     // 1) credit platform escrow & wallet
  //     const platformBalance = await manager.getRepository(UserBalance).findOne({ where: { userId: platformUserId } });
  //     if (!platformBalance) {
  //       // if escrow was never opened, create it now with 0 then credit
  //       const fresh = manager.getRepository(UserBalance).create({
  //         userId: platformUserId,
  //         availableBalance: 0,
  //         credits: 0,
  //         earningsToDate: 0,
  //         cancelledOrdersCredit: 0,
  //       });
  //       await manager.getRepository(UserBalance).save(fresh);
  //     }

  //     const sellerNetPay = Number(sellerAmount) - (Number(sellerAmount) * (Number(inv.sellerServiceFee) / 100));
  //     const totalReverseToEscrow = Number(buyerRefund + sellerNetPay);

  //     const escrowBal = await manager.getRepository(UserBalance).findOne({ where: { userId: platformUserId } });
  //     escrowBal.availableBalance = Number(escrowBal.availableBalance) + totalReverseToEscrow;
  //     platformWallet.balance = Number(platformWallet.balance) + totalReverseToEscrow;

  //     // platform ledger row
  //     const escrowTx = manager.getRepository(Transaction).create({
  //       userId: platformUserId,
  //       type: TransactionType.ESCROW_DEPOSIT,
  //       amount: totalReverseToEscrow,
  //       description: `Reverse dispute: funds returned to escrow for order #${orderId}`,
  //       status: TransactionStatus.COMPLETED,
  //       orderId,
  //       currencyId: 'SAR',
  //     });

  //     // 2) debit seller (reverse payout) if any
  //     let sellerDebitTx: Transaction | null = null;
  //     if (sellerNetPay > 0) {
  //       const sellerBal = await this.getUserBalanceTx(manager, sellerId);
  //       sellerBal.availableBalance = Number(sellerBal.availableBalance) - Number(sellerNetPay);
  //       sellerBal.earningsToDate = Number(sellerBal.earningsToDate) - Number(sellerNetPay);
  //       await manager.getRepository(UserBalance).save(sellerBal);

  //       sellerDebitTx = manager.getRepository(Transaction).create({
  //         userId: sellerId,
  //         type: TransactionType.EARNING_REVERSAL, // negative earning
  //         amount: -Number(sellerNetPay),
  //         description: `Reversal of dispute payout for order #${orderId}`,
  //         status: TransactionStatus.COMPLETED,
  //         orderId,
  //         currencyId: 'SAR',
  //       });
  //     }

  //     // 3) debit buyer (reverse refund) if any
  //     let buyerDebitTx: Transaction | null = null;
  //     if (buyerRefund > 0) {
  //       const buyerBal = await this.getUserBalanceTx(manager, buyerId);
  //       buyerBal.credits = Number(buyerBal.credits) - Number(buyerRefund);
  //       buyerBal.cancelledOrdersCredit = Number(buyerBal.cancelledOrdersCredit) - Number(buyerRefund);
  //       await manager.getRepository(UserBalance).save(buyerBal);

  //       buyerDebitTx = manager.getRepository(Transaction).create({
  //         userId: buyerId,
  //         type: TransactionType.REFUND_REVERSAL, // negative refund
  //         amount: -Number(buyerRefund),
  //         description: `Reversal of dispute refund for order #${orderId}`,
  //         status: TransactionStatus.COMPLETED,
  //         orderId,
  //         currencyId: 'SAR',
  //       });
  //     }

  //     // save updated platform balances + wallet + transactions
  //     await manager.getRepository(UserBalance).save(escrowBal);
  //     await manager.getRepository(Wallet).save(platformWallet);

  //     const saved = await manager.getRepository(Transaction).save([escrowTx, sellerDebitTx, buyerDebitTx].filter(Boolean) as Transaction[]);

  //     const escrowCreditTxId = saved.find(t => t.userId === platformUserId && t.type === 'escrow_deposit')?.id || '';

  //     const sellerDebitTxId = sellerDebitTx ? saved.find(t => t.userId === sellerId && t.type === 'earning_reversal' && t.orderId === orderId)?.id || null : null;

  //     const buyerDebitTxId = buyerDebitTx ? saved.find(t => t.userId === buyerId && t.type === 'refund_reversal' && t.orderId === orderId)?.id || null : null;

  //     // Notifications (platform, seller, buyer)
  //     await manager.getRepository(Notification).save(
  //       [
  //         manager.getRepository(Notification).create({
  //           userId: platformUserId,
  //           type: 'escrow_reversal',
  //           title: 'Escrow credited (reversal)',
  //           message: `Funds returned to platform escrow for order #${orderId}.`,
  //           relatedEntityType: 'order',
  //           relatedEntityId: orderId,
  //         }) as any,
  //         sellerNetPay > 0
  //           ? (manager.getRepository(Notification).create({
  //             userId: sellerId,
  //             type: 'payout_reversed',
  //             title: 'Payout reversed',
  //             message: `Your previous payout for order #${orderId} was reversed back to escrow.`,
  //             relatedEntityType: 'order',
  //             relatedEntityId: orderId,
  //           }) as any)
  //           : null,
  //         buyerRefund > 0
  //           ? (manager.getRepository(Notification).create({
  //             userId: buyerId,
  //             type: 'refund_reversed',
  //             title: 'Refund reversed',
  //             message: `Your previous refund for order #${orderId} was reversed back to escrow.`,
  //             relatedEntityType: 'order',
  //             relatedEntityId: orderId,
  //           }) as any)
  //           : null,
  //       ].filter(Boolean) as any[],
  //     );

  //     return { escrowCreditTxId, sellerDebitTxId, buyerDebitTxId };
  //   });
  // }


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
        promoCredits: 0,
        earningsToDate: 0,
        cancelledOrdersCredit: 0,
      });
      await this.userBalanceRepository.save(balance);
    }
    return balance;
  }

  async getPlatformWallet(): Promise<PlatformWallet> {
    // We search for the first available record since there should only ever be one
    let wallet = await this.platformWalletRepo.findOne({ where: {} });

    if (!wallet) {
      // If it doesn't exist (first time setup), create it
      wallet = this.platformWalletRepo.create({
        totalEscrowBalance: 0,
        platformProfit: 0,
        currency: 'SAR',
      });

      wallet = await this.platformWalletRepo.save(wallet);
    }

    return wallet;
  }

  private async getPlatformWalletTx(manager: EntityManager): Promise<PlatformWallet> {

    let wallet = await manager.findOne(PlatformWallet, { where: {} });

    if (!wallet) {
      // If it doesn't exist, create the initial Treasury row
      wallet = manager.create(PlatformWallet, {
        totalEscrowBalance: 0,
        platformProfit: 0,
        currency: 'SAR',
      });

      wallet = await manager.save(wallet);
    }

    return wallet;
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
  async getTransactions(
    options: {
      page?: number;
      limit?: number;
      type?: string;
      search?: string;
    } = {}, userId?: string
  ) {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    const qb = this.transactionRepository.createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.order', 'order')


    if (userId) {
      qb.where('transaction.userId = :userId', { userId });
    }

    if (options.type) {
      qb.andWhere('transaction.type = :type', { type: options.type });
    }

    if (options.search) {
      qb.andWhere(
        '(transaction.description ILIKE :search)',
        { search: `%${options.search}%` }
      );
    }

    qb.orderBy('transaction.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    const [transactions, total] = await qb.getManyAndCount();

    return {
      transactions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }


  // accounting.service.ts

  async withdrawFunds(userId: string, amount: number) {
    if (amount < 112) throw new BadRequestException('Minimum withdrawal amount is 112 EGP');

    return await this.dataSource.transaction(async (manager) => {
      // 1. Check for Pending Withdrawal
      const existingPending = await manager.findOne(Transaction, {
        where: { userId, type: TransactionType.WITHDRAWAL, status: TransactionStatus.PENDING }
      });

      if (existingPending) {
        throw new BadRequestException('You already have a pending withdrawal request.');
      }

      // 2. Lock & Get Balance
      const balance = await this.getUserBalanceTx(manager, userId);
      if (!balance || Number(balance.availableBalance) < amount) {
        throw new BadRequestException('Insufficient available balance');
      }

      // 3. Get Default Bank Account
      const bankAccount = await manager.findOne(UserBankAccount, {
        where: { userId, isDefault: true }
      });

      if (!bankAccount) throw new NotFoundException('No default bank account found.');

      // 4. Create Transaction Record (Internal)
      let transaction = manager.create(Transaction, {
        userId,
        type: TransactionType.WITHDRAWAL,
        amount: -amount,
        description: `Withdrawal to IBAN: ${bankAccount.iban}`,
        status: TransactionStatus.PENDING,
        currencyId: 'EGP', // Ensure this matches Paymob setup
      });

      // 5. Update Balances
      balance.availableBalance = Number(balance.availableBalance) - amount;
      balance.reservedBalance = Number(balance.reservedBalance) + amount;

      await manager.save(balance);
      transaction = await manager.save(transaction); // Save to get internal ID for client_reference_id

      // 6. Call Gateway
      const gateway = this.gatewayFactory.getGateway();
      const payoutResponse = await gateway.disburseToBank({
        amount: amount,
        fullName: bankAccount.fullName,
        iban: bankAccount.iban,
        bankCode: bankAccount.bankCode,
        clientReferenceId: transaction.id // Using internal DB ID as reference
      });

      // 7. Update External ID
      transaction.externalTransactionId = payoutResponse.externalTransactionId;
      return await manager.save(transaction);
    });
  }

  /**
   * Called by the Background Service to finalize transactions
   */
  async updateWithdrawalStatus(transactionId: string, status: 'SUCCESS' | 'FAILED') {
    return await this.dataSource.transaction(async (manager) => {
      const tx = await manager.findOne(Transaction, { where: { id: transactionId } });
      if (!tx || tx.status !== TransactionStatus.PENDING) return;

      const balance = await this.getUserBalanceTx(manager, tx.userId)

      const amount = Math.abs(Number(tx.amount)); // The withdrawn amount

      if (status === 'SUCCESS') {
        // SUCCESS: Money leaves the system entirely.
        // Decrease Reserved. Do NOT touch Available (already deducted).
        balance.reservedBalance = Math.max(0, Number(balance.reservedBalance) - amount);

        tx.status = TransactionStatus.COMPLETED;
      } else {
        // FAILED: Refund the user.
        // Decrease Reserved, Increase Available.
        balance.reservedBalance = Math.max(0, Number(balance.reservedBalance) - amount);
        balance.availableBalance = Number(balance.availableBalance) + amount;

        tx.status = TransactionStatus.REJECTED;
        tx.description = `${tx.description} [Failed/Reversed]`;
      }

      await manager.save(balance);
      await manager.save(tx);
    });
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
      where: { userId, type: TransactionType.EARNING, status: TransactionStatus.COMPLETED, created_at: Between(start, end) },
    });
    const withdrawals = await this.transactionRepository.find({
      where: { userId, type: TransactionType.WITHDRAWAL, status: TransactionStatus.COMPLETED, created_at: Between(start, end) },
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

  // async processOrderPayment(orderId: string) {
  //   const order = await this.orderRepository.findOne({
  //     where: { id: orderId }, relations: {
  //       buyer: {
  //         person: true // Fetches person details for the buyer
  //       },
  //       seller: {
  //         person: true // Fetches person details for the seller
  //       }
  //     }
  //   });
  //   if (!order) throw new NotFoundException('Order not found');

  //   let sellerBalance = await this.userBalanceRepository.findOne({ where: { userId: order.sellerId } });
  //   if (!sellerBalance) {
  //     sellerBalance = this.userBalanceRepository.create({
  //       userId: order.sellerId,
  //       availableBalance: 0,
  //       credits: 0,
  //       earningsToDate: 0,
  //       cancelledOrdersCredit: 0,
  //     });
  //   }

  //   sellerBalance.availableBalance += order.totalAmount;
  //   sellerBalance.earningsToDate += order.totalAmount;
  //   await this.userBalanceRepository.save(sellerBalance);

  //   const earningTransaction = this.transactionRepository.create({
  //     userId: order.sellerId,
  //     type: TransactionType.EARNING,
  //     amount: order.totalAmount,
  //     description: `Earnings from order #${orderId}`,
  //     status: TransactionStatus.COMPLETED,
  //     orderId,
  //   });

  //   await this.transactionRepository.save(earningTransaction);
  //   return { success: true };
  // }

  // async processRefund(orderId: string, refundAmount: number) {
  //   const order = await this.orderRepository.findOne({
  //     where: { id: orderId }, relations: {
  //       buyer: {
  //         person: true // Fetches person details for the buyer
  //       },
  //       seller: {
  //         person: true // Fetches person details for the seller
  //       }
  //     }
  //   });
  //   if (!order) throw new NotFoundException('Order not found');

  //   const sellerBalance = await this.getUserBalance(order.sellerId);
  //   sellerBalance.availableBalance -= refundAmount;
  //   sellerBalance.earningsToDate -= refundAmount;
  //   await this.userBalanceRepository.save(sellerBalance);

  //   const buyerBalance = await this.getUserBalance(order.buyerId);
  //   buyerBalance.credits += refundAmount;
  //   buyerBalance.cancelledOrdersCredit += refundAmount;
  //   await this.userBalanceRepository.save(buyerBalance);

  //   const sellerRefundTransaction = this.transactionRepository.create({
  //     userId: order.sellerId,
  //     type: TransactionType.REFUND,
  //     amount: -refundAmount,
  //     description: `Refund for order #${orderId}`,
  //     status: TransactionStatus.COMPLETED,
  //     orderId,
  //   });

  //   const buyerRefundTransaction = this.transactionRepository.create({
  //     userId: order.buyerId,
  //     type: TransactionType.REFUND,
  //     amount: refundAmount,
  //     description: `Refund for order #${orderId}`,
  //     status: TransactionStatus.COMPLETED,
  //     orderId,
  //   });

  //   await this.transactionRepository.save([sellerRefundTransaction, buyerRefundTransaction]);
  //   return { success: true };
  // }

  async processWithdrawalAdmin(id: string, action: 'approve' | 'reject') {
    const tx = await this.transactionRepository.findOne({ where: { id, type: TransactionType.WITHDRAWAL } });
    if (!tx) throw new NotFoundException('Withdrawal not found');
    if (tx.status !== TransactionStatus.PENDING) throw new BadRequestException('Only pending withdrawals can be processed');

    if (action === 'approve') {
      tx.status = TransactionStatus.COMPLETED;
      return this.transactionRepository.save(tx);
    } else {
      tx.status = TransactionStatus.REJECTED;
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
      relations: {
        order: true,
        user: {
          person: true // Fetches the profile details linked to this user
        }
      },
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return { transactions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }
}
