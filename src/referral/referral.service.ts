import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Referral, Affiliate, User, UserBalance, Transaction, TransactionStatus, ReferralStatus } from 'entities/global.entity';
import * as crypto from 'crypto';

@Injectable()
export class ReferralService {
  constructor(
    @InjectRepository(Referral)
    private referralRepository: Repository<Referral>,
    @InjectRepository(Affiliate)
    private affiliateRepository: Repository<Affiliate>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserBalance)
    private userBalanceRepository: Repository<UserBalance>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
  ) { }

  async getUserReferralInfo(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      // 2. Select specific fields from both tables
      select: {
        id: true,
        person: {
          username: true,
          referralCode: true,
          referralCount: true,
          referralRewardsCount: true,
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate referral code if it doesn't exist
    if (!user.referralCode) {
      user.person.referralCode = this.generateReferralCode(user.username);
      await this.userRepository.save(user);
    }

    return user;
  }

  async getUserReferralStats(userId: string) {
    const referrals = await this.referralRepository.count({ where: { referrerId: userId } });
    const completedReferrals = await this.referralRepository.count({ where: { referrerId: userId, status: 'completed' } } as any);
    const pendingReferrals = await this.referralRepository.count({ where: { referrerId: userId, status: 'pending' } } as any);

    const totalEarnings = await this.referralRepository
      .createQueryBuilder('referral')
      .select('SUM(referral.creditEarned)', 'total')
      .where('referral.referrerId = :userId', { userId })
      .andWhere('referral.status = :status', { status: 'completed' })
      .getRawOne();

    return {
      totalReferrals: referrals,
      completedReferrals,
      pendingReferrals,
      totalEarnings: totalEarnings?.total ? parseFloat(totalEarnings.total) : 0,
    };
  }

  async getUserReferrals(userId: string, page: number = 1) {
    const limit = 20;
    const skip = (page - 1) * limit;

    const [referrals, total] = await this.referralRepository.findAndCount({
      where: { referrerId: userId },
      relations: {
        referrer: {
          person: true
        }
      },
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return {
      referrals,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getUserAffiliateInfo(userId: string) {
    let affiliate: any = await this.affiliateRepository.findOne({ where: { userId } });

    if (!affiliate) {
      // Create affiliate record if it doesn't exist
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      affiliate = this.affiliateRepository.create({
        userId,
        referralCode: this.generateAffiliateCode(user.username),
        commissionPercent: 10, // Default commission percentage
        clicks: 0,
        signups: 0,
        conversions: 0,
        earnings: 0,
      } as any);

      await this.affiliateRepository.save(affiliate);
    }

    return affiliate;
  }

  async generateAffiliateCode(userId: string) {
    const affiliate: any = await this.getUserAffiliateInfo(userId);

    // Generate a new affiliate code
    affiliate.referralCode = this.generateAffiliateCodeInternal(userId); // Fix recursion by using userId directly

    return this.affiliateRepository.save(affiliate);
  }

  async getUserCommissions(userId: string, page: number = 1) {
    const limit = 20;
    const skip = (page - 1) * limit;

    const [commissions, total] = await this.transactionRepository.findAndCount({
      where: { userId, type: 'commission' },
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return {
      commissions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async withdrawCommission(userId: string, amount: number) {
    if (amount <= 0) {
      throw new BadRequestException('Invalid withdrawal amount');
    }

    const affiliate = await this.getUserAffiliateInfo(userId);
    if (affiliate.earnings < amount) {
      throw new BadRequestException('Insufficient commission earnings');
    }

    // Create withdrawal transaction
    const transaction = this.transactionRepository.create({
      userId,
      type: 'commission_withdrawal',
      amount: -amount,
      currencyId: 'USD', // Ensure currencyId is valid or referenced
      description: 'Commission withdrawal',
      status: TransactionStatus.PENDING,
    });

    // Update affiliate earnings
    affiliate.earnings -= amount;
    await this.affiliateRepository.save(affiliate);

    const savedTransaction = await this.transactionRepository.save(transaction);

    // Process withdrawal (similar to regular withdrawal)
    setTimeout(async () => {
      savedTransaction.status = TransactionStatus.COMPLETED;
      await this.transactionRepository.save(savedTransaction);
    }, 5000);

    return { message: 'Commission withdrawal request submitted', transaction: savedTransaction };
  }

  async trackReferralClick(referralCode: string) {
    const affiliate = await this.affiliateRepository.findOne({ where: { referralCode } });
    if (affiliate) {
      affiliate.clicks += 1;
      await this.affiliateRepository.save(affiliate);
    }
  }

  async processReferralSignup(referralCode: string, newUserId: string) {
    const affiliate = await this.affiliateRepository.findOne({ where: { referralCode } });
    if (affiliate) {
      affiliate.signups += 1;
      await this.affiliateRepository.save(affiliate);

      // Create referral record
      const referral = this.referralRepository.create({
        referrerId: affiliate.userId,
        referredEmail: '', // Will be updated when user completes registration
        referralCode,
        status: 'pending',
        creditEarned: 0,
      } as any);

      await this.referralRepository.save(referral);
    }
  }

  async processReferralConversion(userId: string, orderAmount: number) {
    const user = await this.userRepository.findOne({ where: { id: userId }, relations: ['person', 'person.referredBy'] });

    if (user && user.referredBy) {
      const referrer = user.referredBy;
      const affiliate = await this.affiliateRepository.findOne({ where: { userId: referrer.id } });

      if (affiliate) {
        affiliate.conversions += 1;

        // Calculate commission
        const commission = (orderAmount * affiliate.commissionPercent) / 100;
        affiliate.earnings += commission;

        await this.affiliateRepository.save(affiliate);

        // Update referral record
        const referral: any = await this.referralRepository.findOne({
          where: { referrerId: referrer.id, referredEmail: user.email },
        });

        if (referral) {
          referral.status = 'completed';
          referral.creditEarned = commission;
          referral.completedAt = new Date();
          await this.referralRepository.save(referral);
        }

        // Add commission to referrer's balance
        let referrerBalance = await this.userBalanceRepository.findOne({ where: { userId: referrer.id } });
        if (!referrerBalance) {
          referrerBalance = this.userBalanceRepository.create({
            userId: referrer.id,
            availableBalance: 0,
            credits: 0,
            earningsToDate: 0,
            cancelledOrdersCredit: 0,
          });
        }

        referrerBalance.availableBalance += commission;
        referrerBalance.earningsToDate += commission;
        await this.userBalanceRepository.save(referrerBalance);

        // Create commission transaction
        const commissionTransaction = this.transactionRepository.create({
          userId: referrer.id,
          type: 'commission',
          amount: commission,
          currencyId: 'USD', // Ensure currencyId is valid or referenced
          description: `Commission from referral: ${user.email}`,
          status: TransactionStatus.COMPLETED,
        });

        await this.transactionRepository.save(commissionTransaction);

        return { success: true, commission };
      }
    }

    return { success: false, commission: 0 };
  }

  async processReferral(newUser: User, referralCodeUsed?: string): Promise<void> {
    if (!referralCodeUsed) return;

    const referrerUser = await this.userRepository.findOne({
      where: {
        person: {
          // Remember to trim the input to match your cleaned database
          referralCode: referralCodeUsed.trim()
        }
      },
    });

    if (referrerUser) {
      // Create referral record
      const referral = this.referralRepository.create({
        referrer: referrerUser,
        referrerId: referrerUser.id,
        referredEmail: newUser.email,
        referredUserId: newUser.id,
        referralCode: referralCodeUsed,
        status: ReferralStatus.PENDING,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      });

      await this.referralRepository.save(referral);

      // Update user references
      newUser.person.referredBy = referrerUser;
      newUser.person.referredById = referrerUser.id;
      referrerUser.person.referralCount = (referrerUser.referralCount || 0) + 1;

      await this.userRepository.save([newUser, referrerUser]);
    }
  }

  async completeReferral(userId: string, orderAmount: number): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['person', 'person.referredBy']
    });

    if (user && user.referredBy) {
      const referral = await this.referralRepository.findOne({
        where: {
          referredUserId: userId,
          status: ReferralStatus.PENDING
        },
      });

      if (referral && new Date() < referral.expiresAt) {
        // Calculate reward (example: 10% of first order)
        const rewardAmount = orderAmount * 0.1;

        referral.status = ReferralStatus.COMPLETED;
        referral.creditEarned = rewardAmount;
        referral.completedAt = new Date();

        await this.referralRepository.save(referral);

        // Update referrer's rewards count
        user.referredBy.person.referralRewardsCount = (user.referredBy.referralRewardsCount || 0) + 1;
        await this.userRepository.save(user.referredBy);

        // Add credit to referrer's balance
        await this.addReferralCredit(user.referredBy.id, rewardAmount);
      }
    }
  }

  private async addReferralCredit(userId: string, amount: number): Promise<void> {
    let userBalance = await this.userBalanceRepository.findOne({
      where: { userId }
    });

    if (!userBalance) {
      userBalance = this.userBalanceRepository.create({
        userId,
        availableBalance: amount,
        credits: amount,
        earningsToDate: amount,
        cancelledOrdersCredit: 0,
      });
    } else {
      userBalance.availableBalance += amount;
      userBalance.credits += amount;
      userBalance.earningsToDate += amount;
    }

    await this.userBalanceRepository.save(userBalance);

    // Create transaction record
    const transaction = this.transactionRepository.create({
      userId,
      type: 'referral_credit',
      amount,
      currencyId: 'USD',
      description: `Referral credit from ${userId}`,
      status: TransactionStatus.COMPLETED,
    });

    await this.transactionRepository.save(transaction);
  }

  private generateReferralCode(username: string): string {
    const base = username.toLowerCase().replace(/[^a-z0-9]/g, '');
    const random = crypto.randomBytes(3).toString('hex');
    return `${base}${random}`.substring(0, 12);
  }

  private generateAffiliateCodeInternal(userId: string): string {
    const random = crypto.randomBytes(6).toString('hex');
    return `aff_${userId}_${random}`.substring(0, 20);
  }
}
