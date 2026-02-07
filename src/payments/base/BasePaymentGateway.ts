import { DataSource, EntityManager, Repository } from 'typeorm';
import { TransactionBillingInfo, Order, Transaction, Invoice } from 'entities/global.entity';

import { PreconditionFailedException } from '@nestjs/common';
import { AccountingService } from 'src/accounting/accounting.service';
import { UnifiedCheckout } from './payment.constant';
import { OrdersService } from 'src/orders/orders.service';


export abstract class BasePaymentGateway {
    constructor(
        protected readonly dataSource: DataSource,
        protected readonly accountingService: AccountingService,
        protected readonly orderRepo: Repository<Order>,
        protected readonly transactionBillingRepo: Repository<TransactionBillingInfo>,
        protected readonly ordersService: OrdersService
    ) { }

    protected DEFAULT_CURRENCY = "EGP";
    protected DEFAULT_COUNTRY_ISO2 = "SA";

    // Common logic for all gateways
    protected async createTransactionBillingSnapshot(transactionId: string, userId: string, manager?: EntityManager) {
        const currentInfo = await this.accountingService.getBillingInformation(userId);

        const requiredFields = [
            { key: 'firstName', label: 'First Name' },
            { key: 'lastName', label: 'Last Name' },
            // { key: 'phoneNumber', label: 'Phone Number' },
            // { key: 'email', label: 'Email' },
            { key: 'countryId', label: 'Country' },
            { key: 'stateId', label: 'State' }
        ];

        // Check for missing values
        const missing = requiredFields.filter(field => !currentInfo[field.key]);

        if (missing.length > 0) {
            const missingLabels = missing.map(m => m.label).join(', ');
            throw new PreconditionFailedException(
                `Please complete your billing profile. Missing: ${missingLabels}`
            );
        }

        const snapshotData = {
            transactionId: transactionId,
            userId: userId,
            firstName: currentInfo.firstName,
            lastName: currentInfo.lastName,
            phoneNumber: currentInfo.user.phone,
            email: currentInfo.user.email,
            stateName: currentInfo.state?.name?.trim() || 'N/A',
            countryIso: currentInfo.country?.iso2?.trim() || this.DEFAULT_COUNTRY_ISO2,
            isSaudiResident: currentInfo.isSaudiResident,
        };

        if (manager) {
            const snapshot = manager.create(TransactionBillingInfo, snapshotData);
            return await manager.save(snapshot);
        } else {
            const snapshot = this.transactionBillingRepo.create(snapshotData);
            return await this.transactionBillingRepo.save(snapshot);
        }
    }

    // Abstract method to be implemented by Paymob, Stripe, etc.
    abstract createPaymentIntention(data: UnifiedCheckout, preloadedOrder: Order, invoice: Invoice): Promise<{
        paymentUrl: string;
        transactionId: string;
        orderId: string;
    }>;
    abstract getPayoutTransactions(lookupIds: string[]): Promise<{
        id: string;
        success: boolean;
        pending: boolean;
        failed: boolean;
    }[]>;


    // BasePaymentGateway.ts
    abstract disburseToBank({
        amount,
        fullName,
        iban,
        bankCode,
        clientReferenceId
    }: {
        amount: number;
        fullName: string;
        iban: string;
        bankCode: string;
        clientReferenceId: string;
    }): Promise<{ externalTransactionId: string }>;

    protected async finalizeOrder(txId: string, success: boolean, method: string, extTxId: string, extOrderId: string) {
        return await this.ordersService.completeOrderPayment(txId, success, method, extTxId, extOrderId);
    }

    protected generateFrontendUrl(isSuccess: boolean, orderId: string): string {
        const path = isSuccess ? 'success' : 'fail';
        return `${process.env.FRONTEND_URL}/payment/${path}?orderId=${orderId}`;
    }
}