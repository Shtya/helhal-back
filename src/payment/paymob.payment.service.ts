import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, Logger, NotFoundException, PreconditionFailedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import axios from "axios";
import { Order, OrderStatus, Transaction, TransactionBillingInfo, TransactionStatus, UserBillingInfo } from "entities/global.entity";
import { AccountingService } from "src/accounting/accounting.service";
import { DataSource, EntityManager, Repository } from "typeorm";
import { getPaymobIntegrationId, UnifiedCheckout } from "./payment.types";
import { BasePaymentGateway } from "./BasePaymentGateway";



@Injectable()
export class PaymobPaymentService extends BasePaymentGateway {
    private readonly logger = new Logger(PaymobPaymentService.name);
    private readonly secretKey: string = process.env.PAYMOB_SECRET_KEY!;
    private readonly publicKey: string = process.env.PAYMOB_PUBLIC_KEY!;

    constructor(
        dataSource: DataSource,
        accountingService: AccountingService,
        @InjectRepository(Order) orderRepo: Repository<Order>,
        @InjectRepository(TransactionBillingInfo) transactionBillingRepo: Repository<TransactionBillingInfo>,
    ) {
        super(dataSource, accountingService, orderRepo, transactionBillingRepo);
    }


    async createPaymentIntention(data: UnifiedCheckout, order: Order): Promise<{
        paymentUrl: string;
        transactionId: string;
        orderId: string;
    }> {
        const { userId, billingInfo } = data;
        const paymentMethod = billingInfo.paymentMethod;
        const orderId = order.id;
        const integrationId = getPaymobIntegrationId(paymentMethod as 'card' | 'wallet');
        if (!integrationId) {
            throw new BadRequestException(
                `Payment method '${paymentMethod}' is not currently supported for this gateway.`
            );
        }

        // 1. Verify Order exists
        // 2. Update the main billing profile first (Standardizing the user's current data)
        await this.accountingService.updateBillingInformation(userId, billingInfo);

        // 3. Start DB Transaction for internal records
        return await this.dataSource.transaction(async (manager) => {

            // A. Create the Pending Transaction record
            const transaction = manager.create(Transaction, {
                userId,
                orderId,
                amount: order.totalAmount,
                status: TransactionStatus.PENDING,
                paymentMethod: paymentMethod,
                currencyId: this.DEFAULT_CURRENCY,
                type: 'escrow_deposit', // Added type
                description: `Escrow deposit for order #${orderId}`,
            });
            const savedTx = await manager.save(transaction);

            // B. Create the Billing Snapshot (Locks the data for this specific TX)
            // Note: Use the manager to ensure it's part of the transaction
            const snapshot = await this.createTransactionBillingSnapshot(
                savedTx.id,
                userId,
                manager // Pass manager if your snapshot logic supports it
            );

            // C. Prepare Paymob Payloadء
            const amountInCents = Math.round(Number(savedTx.amount) * 100);

            const payload = {
                amount: amountInCents,
                currency: this.DEFAULT_CURRENCY,
                payment_methods: [Number(getPaymobIntegrationId('card')), Number(getPaymobIntegrationId('wallet'))],
                items: [{
                    name: order.title,
                    amount: amountInCents,
                    quantity: 1
                }],
                billing_data: {
                    first_name: snapshot.firstName,
                    last_name: snapshot.lastName,
                    phone_number: snapshot.phoneNumber,
                    email: snapshot.email,
                    state: snapshot.stateName, // Captured in snapshot logic
                    country: snapshot.countryIso, // Captured in snapshot logic
                },
                special_reference: savedTx.id, // Our internal TX ID
                notification_url: `${process.env.BACKEND_URL}/api/v1/payments/webhooks/paymob`,
                redirection_url: `${process.env.FRONTEND_URL}/payment/success`
            };

            // D. Call Paymob API
            try {
                const response = await axios.post(
                    'https://accept.paymob.com/v1/intention/',
                    payload,
                    { headers: { 'Authorization': `Token ${this.secretKey}` } }
                );

                // LOG THE INTENTION SUCCESS (Log with Timestamp & Parameters)
                this.logger.log(
                    `Paymob Intention Created | Order: ${orderId} | User: ${userId} | Method: ${paymentMethod} | TransactionId: ${savedTx.id}`
                );
                const clientSecret = response.data.client_secret;
                const paymentUrl = `https://accept.paymob.com/unifiedcheckout/?publicKey=${this.publicKey}&clientSecret=${clientSecret}`;
                // Return unified response to frontend
                return {
                    paymentUrl: paymentUrl,
                    transactionId: savedTx.id,
                    orderId: order.id
                };
            } catch (error) {
                this.logger.error(
                    `Paymob Intention Failed | Order: ${orderId} | User: ${userId} | Method: ${paymentMethod} | TransactionId: ${savedTx.id}`,
                    JSON.stringify({
                        paymobError: error.response?.data?.detail || error.message,
                        payload: payload
                    })
                );

                throw new InternalServerErrorException("Paymob initialization failed, please try again or contact support.");
            }
        });
    }

    // async ProcessRefund() {

    // }
    // async GetTransactionStatus() {

    // }
}

