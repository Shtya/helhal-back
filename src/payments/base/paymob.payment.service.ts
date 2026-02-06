import { BadRequestException, ForbiddenException, forwardRef, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException, PreconditionFailedException, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import axios from "axios";
import { Invoice, Order, Transaction, TransactionBillingInfo, TransactionStatus, TransactionType, UserSavedCard } from "entities/global.entity";
import { AccountingService } from "src/accounting/accounting.service";
import { DataSource, In, Repository } from "typeorm";
import { EVENT_TTL_SECONDS, getPaymobIntegrationId, PAYMENT_TIMING, UnifiedCheckout } from "./payment.constant";
import { BasePaymentGateway } from "./BasePaymentGateway";
import * as crypto from 'crypto';
import { RedisService } from "common/RedisService";
import { OrdersService } from "src/orders/orders.service";



@Injectable()
export class PaymobPaymentService extends BasePaymentGateway {
    private readonly logger = new Logger(PaymobPaymentService.name);
    private readonly secretKey: string = process.env.PAYMOB_SECRET_KEY!;
    private readonly publicKey: string = process.env.PAYMOB_PUBLIC_KEY!;
    private readonly apiKey: string = process.env.PAYMOB_API_KEY!;
    private readonly hmacSecret: string = process.env.PAYMOB_HMAC_SECRET!;
    private readonly basePayoutUrl: string = process.env.PAYMOB_PAYOUT_URL!;


    constructor(
        dataSource: DataSource,
        @Inject(forwardRef(() => AccountingService))
        accountingService: AccountingService,
        @InjectRepository(Order) orderRepo: Repository<Order>,
        @InjectRepository(TransactionBillingInfo) transactionBillingRepo: Repository<TransactionBillingInfo>,
        @InjectRepository(Transaction) private transactionRepo: Repository<Transaction>,
        @InjectRepository(UserSavedCard) private savedCardRepo: Repository<UserSavedCard>,
        private readonly redisService: RedisService,
        @Inject(forwardRef(() => OrdersService))
        protected readonly ordersService: OrdersService
    ) {
        super(dataSource, accountingService, orderRepo, transactionBillingRepo, ordersService);
    }


    async createPaymentIntention(data: UnifiedCheckout, order: Order, invoice: Invoice): Promise<{
        paymentUrl: string;
        transactionId: string;
        orderId: string;
    }> {

        const { userId, billingInfo } = data;
        const orderId = order.id;

        // 2. Update the main billing profile first (Standardizing the user's current data)
        await this.accountingService.updateBillingInformation(userId, billingInfo);
        // const savedCards = await this.savedCardRepo.find({ where: { userId } }); // 💢for saved card logic 
        // const cardTokens = savedCards.map(card => card.token); //💢 for saved card logic 
        // 3. Start DB Transaction for internal records
        return await this.dataSource.transaction(async (manager) => {

            // A. Create the Pending Transaction record
            const transaction = manager.create(Transaction, {
                userId,
                orderId,
                amount: invoice.totalAmount,
                status: TransactionStatus.PENDING,
                currencyId: this.DEFAULT_CURRENCY,
                type: TransactionType.ESCROW_DEPOSIT, // Added type
                description: `Escrow deposit for order #${orderId} (Invoice #${invoice.id})`,
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
                // card_tokens: cardTokens, // 💢for saved card logic 
                payment_methods: [Number(getPaymobIntegrationId('card')), Number(getPaymobIntegrationId('wallet'))],
                expiration: PAYMENT_TIMING.INTENTION_TTL, // 30 minutes
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
                redirection_url: `${process.env.BACKEND_URL}/api/v1/payments/paymob/callback`,
                // notification_url: 'https://binaural-taryn-unprecipitatively.ngrok-free.dev/api/v1/payments/webhooks/paymob',
                // redirection_url: 'https://binaural-taryn-unprecipitatively.ngrok-free.dev/api/v1/payments/paymob/callback',
            };

            // D. Call Paymob API
            try {
                const response = await axios.post(
                    'https://accept.paymob.com/v1/intention/',
                    payload,
                    { headers: { 'Authorization': `Token ${this.secretKey}` } }
                );
                const intentionData = response.data;

                await manager.update(Transaction, savedTx.id, {
                    externalOrderId: intentionData.intention_order_id.toString(), // The 458204104 ID
                });


                // LOG THE INTENTION SUCCESS (Log with Timestamp & Parameters)
                this.logger.log(
                    `Paymob Intention Created | Order: ${orderId} | User: ${userId} | TransactionId: ${savedTx.id} | PaymobOrderId: ${intentionData.intention_order_id}`,
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
                    `Paymob Intention Failed | Order: ${orderId} | User: ${userId} | TransactionId: ${savedTx.id}`,
                    JSON.stringify({
                        paymobError: error.response?.data?.detail || error.message,
                        payload: payload
                    })
                );

                throw new InternalServerErrorException("Paymob initialization failed, please try again or contact support.");
            }
        });
    }

    async processWebhook(body: any, queryHmac: string) {
        const type = body.type;
        const eventId = body.obj?.id || 'N/A';

        // Log 1: Inbound Entry
        this.logger.log(`[Webhook Received] Type: ${type} | Paymob_ID: ${eventId}`);

        // 1. Validate HMAC
        const isValid = this.validateHmac(body, queryHmac);
        if (!isValid) {
            this.logger.warn(`[HMAC Failed] Unauthorized attempt for event ${eventId}`);
            throw new UnauthorizedException('Invalid HMAC');
        }

        if (type === 'TRANSACTION') {
            return await this.handleTransactionWebhook(body.obj);
        }

        // if (type === 'TOKEN') { // 💢for saved card logic 
        //     return await this.handleTokenWebhook(body.obj);
        // }
    }

    private validateHmac(body: any, queryHmac: string): boolean {
        const obj = body?.obj;
        const type = body?.type;

        let fields: string[] = [];

        if (type === 'TRANSACTION') {
            fields = [
                "amount_cents", "created_at", "currency", "error_occured",
                "has_parent_transaction", "id", "integration_id", "is_3d_secure",
                "is_auth", "is_capture", "is_refunded", "is_standalone_payment",
                "is_voided", "order.id", "owner", "pending",
                "source_data.pan", "source_data.sub_type", "source_data.type", "success"
            ];
        }
        // else if (type === 'TOKEN') { // 💢for saved card logic 
        //     // These are the specific fields Paymob uses for the Card Token HMAC
        //     fields = [
        //         "card_subtype",
        //         "created_at",
        //         "email",
        //         "id",
        //         "masked_pan",
        //         "merchant_id",
        //         "order_id",
        //         "token"
        //     ];
        // } 
        else {
            this.logger.error(`Unsupported webhook type for HMAC: ${type}`);
            return false;
        }

        let concatenatedString = '';
        for (const field of fields) {
            let value = obj;
            field.split('.').forEach(part => value = value?.[part]);

            if (typeof value === 'boolean') concatenatedString += value.toString();
            else if (value !== undefined && value !== null) concatenatedString += value;
        }

        const calculatedHmac = crypto
            .createHmac('sha512', this.hmacSecret)
            .update(concatenatedString)
            .digest('hex');

        return calculatedHmac === queryHmac;
    }

    private async handleTransactionWebhook(trxObj: any) {
        const paymobTrxId = trxObj.id.toString();
        const internalTxId = trxObj.order.merchant_order_id;
        const paymobOrderId = trxObj.order.id.toString();
        const isSuccess = trxObj.success === true;
        const paymentMethod = trxObj.source_data?.sub_type || trxObj.source_data?.type || 'online';

        // 1. Permanent Check: Has this transaction been processed in the last 72 hours?
        const processedKey = `paymob:processed:${paymobTrxId}`;
        const alreadyHandled = await this.redisService.get(processedKey);
        if (alreadyHandled) {
            this.logger.log(`[Webhook] Skipping already processed paymob transaction: ${paymobTrxId}`);
            return;
        }

        // 2. Concurrency Lock: Prevent multiple webhooks for the same ID hitting simultaneously
        const lockKey = `lock:paymob_webhook_active:${paymobTrxId}`;
        const acquired = await this.redisService.setNxWithTtl(lockKey, 'processing', 60); // 60 sec safety lock

        if (!acquired) {
            this.logger.warn(`[Webhook] Concurrent request detected for TRX: ${paymobTrxId}. Ignoring.`);
            return;
        }

        try {
            if (!isSuccess) {
                this.logger.log(`❌ Transaction Failed | Internal TX: ${internalTxId} | Paymob TX: ${paymobTrxId}`);
            }

            // 3. Process the Order
            await this.finalizeOrder(
                internalTxId,
                isSuccess,
                paymentMethod,
                paymobTrxId,
                paymobOrderId
            );

            // 4. Store "Processed" status for 72 hours (3 days = 259200 seconds)
            const SEVENTY_TWO_HOURS = 259200;
            await this.redisService.set(processedKey, 'true', SEVENTY_TWO_HOURS);

        } catch (error) {
            if (error instanceof BadRequestException || error instanceof NotFoundException) {
                this.logger.warn(`[Webhook Conflict] ${error.message}`);
                return;
            }
            this.logger.error(`[CRITICAL] Payment Finalization Failed for TX: ${internalTxId}`, error.stack);
            throw error;
        } finally {
            // 5. Release the active concurrency lock regardless of success or failure
            await this.redisService.del(lockKey);
        }
    }

    private async handleTokenWebhook(tokenObj: any) {
        const paymobOrderId = tokenObj.order_id?.toString();

        // 1. Primary Lookup: Use the Intention ID (The most reliable link)
        let transaction = await this.transactionRepo.findOne({
            where: { externalOrderId: paymobOrderId },
            order: { created_at: 'DESC' },
            relations: ['user'] // Ensure we get the user object
        });

        // 3. Error Handling: If still not found, we cannot link this token to a user
        if (!transaction) {
            this.logger.error(`[Token Orphaned] No transaction found for Order: ${paymobOrderId}`);
            return;
        }

        // 4. Upsert the card token
        // We use ['userId', 'token'] as the conflict path to avoid duplicate tokens for the same user
        try {
            await this.savedCardRepo.upsert({
                userId: transaction.userId,
                token: tokenObj.token,
                maskedPan: tokenObj.masked_pan,
                cardSubtype: tokenObj.card_subtype,
                paymobTokenId: tokenObj.id.toString(),
                lastTransactionId: transaction.id
            }, ['userId', 'token']);

            this.logger.log(`[Token Success] Saved card for User: ${transaction.userId}`);
        } catch (err) {
            this.logger.error(`Failed to upsert saved card: ${err.message}`);
        }
    }

    private async getAuthToken(): Promise<string> {
        const cacheKey = 'paymob_auth_token';

        // 1. Try to get token from Redis
        const cachedToken = await this.redisService.redisClient.get(cacheKey);
        if (cachedToken) {
            return cachedToken;
        }

        // 2. If no token, use a temporary lock to prevent "Cache Stampede"
        // This ensures only ONE request refreshes the token if 100 people click pay at once
        const lockKey = 'lock:paymob_auth_refresh';
        const lockAcquired = await this.redisService.setNxWithTtl(lockKey, 'locked', 10);

        if (!lockAcquired) {
            // If we didn't get the lock, wait a moment and try Redis again
            await new Promise(resolve => setTimeout(resolve, 1000));
            return this.getAuthToken();
        }

        this.logger.log('🔐 Refreshing Paymob Auth Token in Redis...');

        try {
            const response = await axios.post(`${this.basePayoutUrl}/o/token/`, {
                client_id: this.apiKey,
                client_secret: this.apiKey,
                username: this.apiKey,
                password: this.apiKey,
                scope: this.apiKey
            });

            const token = response.data.token;

            // 3. Store in Redis with TTL (e.g., 50 minutes = 3000 seconds)
            // Paymob tokens usually last 1 hour, so we refresh 10 mins early
            await this.redisService.redisClient.set(cacheKey, token, 'EX', 3000);

            return token;
        } catch (error) {
            this.logger.error(`Failed to authenticate with Paymob: ${error.message}`, error.response?.data);
            throw new UnauthorizedException('Could not generate Paymob Auth Token');
        } finally {
            // 4. Release the lock
            await this.redisService.redisClient.del(lockKey);
        }
    }

    async getPaymobTransaction(transactionId: string) {
        try {
            const token = await this.getAuthToken();

            const response = await axios.get(
                `https://accept.paymob.com/api/acceptance/transactions/${transactionId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            return response.data;
        } catch (error) {
            this.logger.error(`Error fetching Paymob Transaction ${transactionId}: ${error.message}`);
            return null;
        }
    }

    async handleRedirection(query: any): Promise<string> {
        const queryHmac = query.hmac;
        const paymobOrderId = query.order;

        // 1. Validate the HMAC for redirection
        const isValid = this.validateRedirectionHmac(query, queryHmac);
        if (!isValid) {
            this.logger.warn(`[Redirection HMAC Failed] Order: ${paymobOrderId}`);
            return `${process.env.FRONTEND_URL}/payment/fail?error=secure_verification_failed`;
        }

        // 2. Find the last transaction for that externalOrderId (most recent first)
        const transaction = await this.transactionRepo.findOne({
            where: { externalOrderId: paymobOrderId?.toString() },
            order: { created_at: 'DESC' }
        });

        const internalOrderId = transaction?.orderId || 'unknown';

        // 3. Determine success from query (string 'true')
        const isSuccess = query.success === 'true';

        // 4. Try to extract Paymob data.message in many forms:
        //    - query.data can be an object or a JSON string
        //    - query.data.message (nested)
        //    - query.message (top-level)
        //    - query['data.message'] (unlikely but be robust)
        let rawMessage: string | undefined;

        try {
            if (query.data) {
                // if data is stringified JSON, parse it
                if (typeof query.data === 'string') {
                    try {
                        const parsed = JSON.parse(query.data);
                        if (parsed && typeof parsed === 'object' && parsed.message) {
                            rawMessage = String(parsed.message);
                        } else if (parsed && typeof parsed === 'object') {
                            // fallback: check common fields
                            rawMessage = parsed.message || parsed.txn_response_message || parsed.acq_response_message;
                        }
                    } catch (e) {
                        // not JSON — maybe it's a plain string
                        rawMessage = query.data;
                    }
                } else if (typeof query.data === 'object') {
                    rawMessage = query.data.message || query.data.txn_response_message || query.data.acq_response_message;
                }
            }

            // Some providers may send message at top-level
            if (!rawMessage && query.message) rawMessage = String(query.message);
            if (!rawMessage && query['data.message']) rawMessage = String(query['data.message']);
        } catch (err) {
            this.logger.warn('[Redirection] Failed to parse data message', err);
        }

        // 5. Normalize / map Paymob messages to short error codes

        const shortError = this.normalizeError(rawMessage, query);

        // 6. Return the proper redirect URL
        if (isSuccess) {
            return `${process.env.FRONTEND_URL}/payment/success?orderId=${encodeURIComponent(internalOrderId)}`;
        } else {
            // include both a short machine-friendly error code and a human-readable detail for support
            const params = new URLSearchParams({
                orderId: String(internalOrderId),
                error: shortError,
            });
            return `${process.env.FRONTEND_URL}/payment/fail?${params.toString()}`;
        }
    }
    private normalizeError = (msg?: string, queryObj?: any) => {
        if (!msg) {
            // fallback to acq response or txn code if available
            const acq = queryObj?.data?.acq_response_code || queryObj?.acq_response_code;
            if (acq && String(acq).toUpperCase() === 'DO_NOT_PROCEED') return 'DO_NOT_PROCEED';
            return 'unknown_error';
        }

        const m = msg.toUpperCase();

        // anything beginning with AUTHENTICATION_ -> AUTHENTICATION_PROBLEM
        if (m.startsWith('AUTHENTICATION_')) return 'AUTHENTICATION_PROBLEM';

        // Common/possible mappings (extend as you see Paymob returns)
        if (m.includes('INSUFFICIENT')) return 'INSUFFICIENT_FUNDS';
        if (m.includes('EXPIRED') || m.includes('CARD_EXPIRED')) return 'CARD_EXPIRED';
        if (m.includes('FAILED') || m.includes('DECLINED')) return 'PAYMENT_FAILED';
        if (m.includes('3DS') || m.includes('AUTHENTICATION')) return 'AUTHENTICATION_PROBLEM';
        if (m.includes('FRAUD')) return 'FRAUD_SUSPECTED';
        if (m.includes('PROCESSOR') || m.includes('ACQUIRER')) return 'PROCESSOR_DECLINED';

        // If nothing matched, trim and use unknown with short token
        return 'unknown_error';
    };

    private validateRedirectionHmac(query: any, queryHmac: string): boolean {
        // These are the exact keys Paymob sends in the redirection query for HMAC
        // Important: They MUST be in this specific order
        const keys = [
            "amount_cents",
            "created_at",
            "currency",
            "error_occured",
            "has_parent_transaction",
            "id",
            "integration_id",
            "is_3d_secure",
            "is_auth",
            "is_capture",
            "is_refunded",
            "is_standalone_payment",
            "is_voided",
            "order", // Note: in redirection, Paymob uses 'order' instead of 'order.id'
            "owner",
            "pending",
            "source_data.pan",
            "source_data.sub_type",
            "source_data.type",
            "success"
        ];

        let concatenatedString = '';

        for (const key of keys) {
            let value = query[key];

            // Special handling for nested keys in the query string 
            // (Paymob often sends them flat as 'source_data.type' in redirection)
            if (value === undefined || value === null) {
                concatenatedString += '';
            } else {
                concatenatedString += value;
            }
        }

        const calculatedHmac = crypto
            .createHmac('sha512', this.hmacSecret)
            .update(concatenatedString)
            .digest('hex');

        return calculatedHmac === queryHmac;
    }

    // async ProcessRefund() {

    // }
    // async GetTransactionStatus() {

    // }
}
