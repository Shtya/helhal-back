import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SmsService {
    // Using NestJS Logger for better formatting and context
    private readonly logger = new Logger(SmsService.name);

    private readonly smsApiUrl = 'https://sms.connectsaudi.com/sendurl.aspx';
    private readonly smsUser = process.env.SMS_API_USER;
    private readonly smsPassword = process.env.SMS_API_PASSWORD;
    private readonly smsKey = process.env.SMS_API_KEY;
    private readonly senderId = 'SMSAlert';

    async send(phoneNumber: string, countryCode: string, message: string) {
        const params = {
            user: this.smsUser,
            pwd: this.smsPassword,
            senderid: this.senderId,
            mobileno: phoneNumber,
            msgtext: message,
            priority: 'High',
            CountryCode: countryCode,
            key: this.smsKey,
        };

        // Log the outgoing request details (masking password for security)
        this.logger.debug(`Sending SMS to ${countryCode}${phoneNumber} via ${this.smsApiUrl}`);
        this.logger.verbose(`Request Params: ${JSON.stringify({ ...params, pwd: '****' })}`);

        try {
            const response = await axios.get(this.smsApiUrl, { params });
            const result = response.data;

            this.logger.log(`SMS Provider Response: ${JSON.stringify(result)}`);

            // Check if result exists and follows the expected format
            if (Array.isArray(result) && result.length > 0) {
                const mainResponse = result[0];

                if (mainResponse.response === 'send success') {
                    return { success: true, msgId: mainResponse.msg_id };
                }

                // Log specific failure reason from provider
                this.logger.warn(`SMS Provider rejected message: ${mainResponse.response}`);
                throw new BadRequestException(`Provider error: ${mainResponse.response}`);
            }

            throw new BadRequestException('Invalid response format from SMS provider');

        } catch (err) {
            // Log full error details for debugging
            this.logger.error(
                `Failed to send SMS to ${phoneNumber}. Error: ${err.message}`,
                err.response?.data || 'No response data'
            );

            throw new BadRequestException(
                err.response?.data?.message || 'Error sending SMS via provider'
            );
        }
    }
}