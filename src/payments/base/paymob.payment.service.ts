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
    private readonly client_id: string = process.env.PAYMOB_PAYOUT_CLIENT_ID!;
    private readonly client_secret: string = process.env.PAYMOB_PAYOUT_CLIETN_SECRET!;
    private readonly username: string = process.env.PAYMOB_PAYOUT_USERNAME!;
    private readonly password: string = process.env.PAYMOB_PAYOUT_PASSWORD!;


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
        const accessKey = 'paymob_access_token';
        const refreshKey = 'paymob_refresh_token';
        const lockKey = 'lock:paymob_auth_refresh';

        // 1. Try to get Access Token from Redis
        const cachedAccessToken = await this.redisService.redisClient.get(accessKey);
        if (cachedAccessToken) {
            return cachedAccessToken.trim(); // Ensure it's trimmed per preference
        }

        // 2. Prevent Cache Stampede with a lock
        const lockAcquired = await this.redisService.setNxWithTtl(lockKey, 'locked', 10);
        if (!lockAcquired) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return this.getAuthToken();
        }

        this.logger.log('🔐 Access token expired. Checking for Refresh Token...');

        try {
            const cachedRefreshToken = await this.redisService.redisClient.get(refreshKey);
            let response;

            if (cachedRefreshToken) {
                // 3. Attempt to Refresh the Token
                try {
                    this.logger.log('🔄 Attempting Refresh Token grant...');
                    response = await this.callPaymobAuth({
                        grant_type: 'refresh_token',
                        refresh_token: cachedRefreshToken.trim(),
                    });
                } catch (err) {
                    this.logger.warn('⚠️ Refresh token invalid/expired. Falling back to password grant.');
                }
            }

            // 4. Fallback to Password Grant if refresh failed or didn't exist
            if (!response) {
                this.logger.log('🔑 Performing full Password Grant login...');
                response = await this.callPaymobAuth({
                    grant_type: 'password',
                    username: this.username.trim(),
                    password: this.password.trim(),
                });
            }

            const { access_token, refresh_token, expires_in } = response.data;

            // 5. Save both tokens with TTL
            // Access token: Refresh 10 mins early (expires_in - 600)
            const accessTtl = expires_in > 600 ? expires_in - 600 : 3000;
            await this.redisService.redisClient.set(accessKey, access_token, 'EX', accessTtl);

            // Refresh token: Usually lasts longer (e.g., 7 days)
            await this.redisService.redisClient.set(refreshKey, refresh_token, 'EX', 604800);

            return access_token;

        } catch (error) {
            this.logger.error(`❌ Paymob Auth Failed: ${error.message}`, error.response?.data);
            throw new UnauthorizedException('Could not generate Paymob Auth Token');
        } finally {
            await this.redisService.redisClient.del(lockKey);
        }
    }

    /**
     * Helper to centralize the axios call with trimmed credentials
     */
    private async callPaymobAuth(extraParams: Record<string, string>) {
        const params = new URLSearchParams();
        params.append('client_id', this.client_id.trim());
        params.append('client_secret', this.client_secret.trim());

        for (const [key, value] of Object.entries(extraParams)) {
            params.append(key, value);
        }

        return axios.post(`${this.basePayoutUrl}/o/token/`, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
    }

    /**
 * Bulk Transaction Inquiry for Payouts
 * Implements Paymob Throttling: 5 requests per minute
 * Pagination: 50 objects per request
 */
    async getPayoutTransactions(lookupIds: string[]) {
        if (!lookupIds || lookupIds.length === 0) return [];

        try {
            const token = await this.getAuthToken();

            // 1. Prepare the payload based on your provided documentation
            const payload = {
                transactions_ids_list: lookupIds,
                // Assuming these are bank payouts based on previous context
                bank_transactions: true
            };

            // 2. Call the inquiry endpoint
            // Using axios(config) because standard axios.get doesn't always accept a body
            const response = await axios({
                method: 'GET',
                url: `${this.basePayoutUrl}/transaction/inquire/`,
                data: payload,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const results = response.data.results || [];

            // 3. Map Paymob's disbursement_status to our internal flags
            return results.map(res => ({
                id: res.transaction_id,
                success: res.disbursement_status === 'successful',
                pending: res.disbursement_status === 'pending' || res.disbursement_status === 'processing',
                failed: res.disbursement_status === 'failed' || res.disbursement_status === 'rejected',
                // Included for logging/debugging if needed
                statusDescription: res.status_description
            }));

        } catch (error) {
            this.logger.error(
                `❌ Paymob Bulk Inquiry Failed: ${error.message}`,
                error.response?.data
            );
            // Return empty array so the cleanup service doesn't crash
            return [];
        }
    }
    async processPayoutWebhook(body: any) {
        const paymobTrxId = body.transaction_id?.toString();
        const status = body.disbursement_status; // e.g., 'successful' or 'failed'
        const statusDescription = body.status_description;

        this.logger.log(`[Payout Webhook] Received for Paymob ID: ${paymobTrxId} | Status: ${status}`);

        if (!paymobTrxId) {
            this.logger.error('[Payout Webhook] Missing transaction_id in body');
            return;
        }

        // 1. Deduplication: Check if this Paymob transaction was already processed
        const processedKey = `paymob_payout:processed:${paymobTrxId}`;
        const alreadyHandled = await this.redisService.get(processedKey);
        if (alreadyHandled) {
            this.logger.log(`[Payout Webhook] Skipping already processed payout: ${paymobTrxId}`);
            return;
        }

        // 2. Find the internal transaction record using the external ID
        const transaction = await this.transactionRepo.findOne({
            where: { externalTransactionId: paymobTrxId },
            select: ['id', 'status', 'userId'] // Fetch minimal fields for performance
        });

        if (!transaction) {
            this.logger.warn(`[Payout Webhook] No internal transaction found for Paymob ID: ${paymobTrxId}`);
            return;
        }

        // 3. Update the Ledger based on status
        try {
            if (status === 'successful') {
                await this.accountingService.updateWithdrawalStatus(transaction.id, 'SUCCESS');
                this.logger.log(`✅ Payout Successful: Internal TX ${transaction.id}`);
            } else if (status === 'failed') {
                // Log the reason for failure (e.g., 'Invalid bank code')
                this.logger.warn(`❌ Payout Failed: Internal TX ${transaction.id} | Reason: ${statusDescription}`);
                await this.accountingService.updateWithdrawalStatus(transaction.id, 'FAILED');
            }

            // 4. Mark as processed for 72 hours to prevent duplicate processing
            await this.redisService.set(processedKey, 'true', 259200);

        } catch (error) {
            this.logger.error(`[Payout Webhook Error] Failed to update ledger for TX ${transaction.id}: ${error.message}`);
            throw error; // Rethrow so the controller can return a 500 and Paymob can retry later
        }
    }

    // paymob.payment.service.ts

    async disburseToBank({
        amount,
        fullName,
        iban,
        bankCode,
        clientReferenceId
    }) {
        const token = await this.getAuthToken();

        try {
            const requestBody = {
                issuer: "instant_bank",
                amount: Number(amount), // Force number type
                full_name: fullName.trim(),
                bank_card_number: iban.trim(),
                bank_code: bankCode.trim(),
                customer_bears_fees: true,
                client_reference_id: clientReferenceId.toString().trim()
            };

            const response = await axios.post(
                `${this.basePayoutUrl}/disburse/`,
                requestBody,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const data = response.data;

            // Throw error if Paymob explicitly returns a failed status
            if (data.disbursement_status === 'failed') {
                throw new BadRequestException(`Paymob Disbursement Failed: ${data.status_description}`);
            }

            return {
                externalTransactionId: data.transaction_id.toString()
            };
        } catch (error) {
            // 1. Log the full object for server-side debugging
            this.logger.error(`Paymob Payout Error: ${error.message}`, error.response?.data);

            const errorData = error.response?.data;
            let finalMessage = 'Failed to initiate payout with provider';

            if (errorData && errorData.status_description) {
                const desc = errorData.status_description;

                // 2. Handle Object Case: { "bank_card_number": ["Ensure this value..."] }
                if (typeof desc === 'object' && desc !== null) {
                    finalMessage = Object.entries(desc)
                        .map(([field, messages]) => {
                            const m = Array.isArray(messages) ? messages.join(', ') : messages;
                            return `${field}: ${m}`;
                        })
                        .join(' | ');
                }
                // 3. Handle String Case: "Process stopped during an internal error..."
                else if (typeof desc === 'string') {
                    finalMessage = desc;
                }
            }

            // 4. Throw the specific message caught
            throw new BadRequestException(finalMessage);
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
