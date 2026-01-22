import { Injectable, BadRequestException, Logger, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';

@Injectable()
export class NafathService {
    private readonly logger = new Logger(NafathService.name);

    // Config from provided JSON
    private readonly baseUrl = 'https://mock-service.api.elm.sa/nafath';
    private readonly appId = process.env.NAFATH_APP_ID;
    private readonly appKey = process.env.NAFATH_APP_KEY;

    /**
     * Securely mask National ID for logging
     */
    private maskNationalId(id: string): string {
        return id ? id.replace(/.(?=.{3})/g, '*') : 'N/A';
    }

    /**
     * 1. Create MFA Request
     * POST /api/v1/mfa/request
     */
    async createMfaRequestMock(nationalId: string, service: string, requestId: string, local: 'ar' | 'en' = 'ar') {
        // Generates a random integer between 10 and 99 inclusive
        const randomTwoDigits = Math.floor(Math.random() * 90 + 10).toString();

        return {
            transId: crypto.randomUUID(), // Mocking a standard UUID for the transaction
            random: randomTwoDigits
        };
    }
    async getMfaStatusMock(nationalId: string, transId: string, random: string) {
        // These statuses are directly from the MfaStatusResponseDto schema
        const statuses = ["WAITING", "EXPIRED", "REJECTED", "COMPLETED"];

        // Pick a random status from the array
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

        // Return the response object matching your schema structure
        return {
            status: randomStatus,
            token: randomStatus === 'COMPLETED' ? 'mock_jwt_token_string' : null
        };
    }

    async verifyNafathTokenMock(token: string): Promise<any> {
        // MOCK: In a real test, you can pass specific strings to test success/failure
        return new Promise((resolve, reject) => {
            this.logger.log(`Mock Verifying Token: ${token}`);

            // 1. Simulate an error/expired case
            if (token === 'expired_token' || token === 'invalid_token') {
                this.logger.warn(`Nafath Token Mock Verification Failed: Mocked failure`);
                return reject(new UnauthorizedException('Invalid or expired Nafath token'));
            }

            // 2. Simulate Success
            const decodedMock = {
                sub: "1023456789", // Mock National ID
                fullname: "John Doe",
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 3600
            };

            this.logger.log('Nafath Token verified successfully (MOCK).');
            resolve(decodedMock);
        });
    }
    async createMfaRequest(nationalId: string, service: string, requestId: string, local: 'ar' | 'en' = 'ar') {

        const url = `${this.baseUrl}/api/v1/mfa/request`;

        try {
            this.logger.log(`Initiating Nafath request for ID: ${this.maskNationalId(nationalId)} | ClientID: ${requestId}`);

            const resp = await axios.post(
                url,
                { nationalId, service }, // MfaRequestModel
                {
                    headers: {
                        'APP-ID': this.appId,
                        'APP-KEY': this.appKey,
                    },
                    params: { local, requestId } // Required query params
                }
            );

            this.logger.log(`Nafath Request Created Successfully. Transaction: ${resp.data.transId}`);
            const { transId, random } = resp.data;
            return { transId, random }
        } catch (err) {
            this.logger.error(`Nafath Create Error: ${err.message}`);
            throw new BadRequestException('Failed to initiate Nafath identity verification');
        }
    }

    /**
     * 2. Retrieve MFA Status
     * POST /api/v1/mfa/request/status
     */
    async getMfaStatus(nationalId: string, transId: string, random: string) {
        const url = `${this.baseUrl}/api/v1/mfa/request/status`;

        try {
            // Log the check without exposing full sensitive data
            this.logger.debug(`Checking status for TransID: ${transId}`);

            const resp = await axios.post(
                url,
                { nationalId, transId, random }, // MfaStatusRequestModel
                {
                    headers: {
                        'APP-ID': this.appId,
                        'APP-KEY': this.appKey,
                    }
                }
            );
            const { status, token } = resp.data;
            return { status, token }; // Returns { status: "WAITING" | "EXPIRED" "REJECTED" | "COMPLETED" }
        } catch (err) {
            this.logger.error(`Nafath Status Check Error: ${err.message}`);
            // No sensitive info in the re-thrown error for the frontend
            throw new BadRequestException('Unable to verify Nafath status at this time');
        }
    }

    private readonly jwksClient = new JwksClient({
        jwksUri: `${this.baseUrl}/api/v1/mfa/jwk`,
        cache: true, // Recommended for production to avoid fetching keys on every request
        rateLimit: true,
    });

    private getKey = (header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) => {
        this.jwksClient.getSigningKey(header.kid, (err, key) => {
            if (err) {
                this.logger.error(`Error fetching signing key: ${err.message}`);
                return callback(err);
            }
            const signingKey = key.getPublicKey();
            callback(null, signingKey);
        });
    };

    /**
     * 3. Retrieve JWK
     * GET /api/v1/mfa/jwk
     */
    async verifyNafathToken(token: string): Promise<any> {
        return new Promise((resolve, reject) => {
            jwt.verify(
                token,
                this.getKey,
                { algorithms: ['RS256'] },
                (err, decoded) => {
                    if (err) {
                        this.logger.warn(`Nafath Token Verification Failed: ${err.message}`);
                        return reject(new UnauthorizedException('Invalid or expired Nafath token'));
                    }

                    // Successfully verified!
                    this.logger.log('Nafath Token verified successfully.');
                    this.logger.log(`decoded jwt:  ${decoded}`);

                    //use decoded
                    resolve(decoded);
                },
            );
        });
    }
}