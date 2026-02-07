import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Transaction, TransactionStatus, TransactionType } from 'entities/global.entity';
import { AccountingService } from 'src/accounting/accounting.service';
import { PaymentGatewayFactory } from 'src/payments/base/payment.gateway.factory';
import { Repository, LessThan } from 'typeorm';

@Injectable()
export class WithdrawalCleanupService {
    private readonly logger = new Logger(WithdrawalCleanupService.name);

    constructor(
        @InjectRepository(Transaction)
        private readonly transactionRepository: Repository<Transaction>,
        private readonly accountingService: AccountingService,
        private readonly gatewayFactory: PaymentGatewayFactory,
    ) { }

    @Cron('0 */15 * * * *')
    async checkPendingWithdrawals() {
        this.logger.log('🕵️ Starting Batch Withdrawal Reconciliation Job...');

        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

        const pendingWithdrawals = await this.transactionRepository.find({
            where: {
                status: TransactionStatus.PENDING,
                type: TransactionType.WITHDRAWAL,
                created_at: LessThan(fifteenMinutesAgo),
            },
            take: 50,
        });

        if (pendingWithdrawals.length === 0) return;

        // 1. Extract only valid IDs
        const idMap = new Map(
            pendingWithdrawals
                .filter(tx => !!tx.externalTransactionId)
                .map(tx => [tx.externalTransactionId, tx])
        );

        const externalIds = Array.from(idMap.keys());
        if (externalIds.length === 0) return;

        const gateway = this.gatewayFactory.getGateway();

        // 2. ONE call to fetch all 50 statuses
        const payoutResults = await gateway.getPayoutTransactions(externalIds);

        // 3. Process the results concurrently in the database
        const updatePromises = payoutResults.map(async (result) => {
            const tx = idMap.get(result.id);
            if (!tx) return;

            if (result.success) {
                await this.accountingService.updateWithdrawalStatus(tx.id, 'SUCCESS');
            } else if (result.failed) {
                await this.accountingService.updateWithdrawalStatus(tx.id, 'FAILED');
            }
        });

        await Promise.allSettled(updatePromises);
        this.logger.log(`✅ Batch reconciliation complete for ${payoutResults.length} records.`);
    }
}