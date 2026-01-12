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

    async sendOTP(phone: string, dialCode: string, otp: string, expire: number) {
        // Clean the dialCode and phone to ensure no '+' or spaces remain
        const cleanDialCode = dialCode.replace('+', '').trim();
        const cleanPhone = phone.trim();
        const fullNumber = `${cleanDialCode}${cleanPhone}`;

        const message = `Your Helhal OTP is ${otp}. It expires in ${expire} minutes.`;

        // Exact payload structure from your documentation
        const payload = {
            user: this.smsUser,
            pwd: this.smsPassword,
            apiKey: this.smsKey,
            numbers: fullNumber,
            sender: this.senderId,
            msg: message,
            lang: "3" // 3 usually indicates UTF-8 or dynamic content
        };

        this.logger.debug(`Sending OTP to ${fullNumber}`);

        try {
            // Using POST as the provided structure is a JSON object
            const response = await axios.post(this.smsApiUrl, payload);

            this.logger.log(`SMS Response: ${JSON.stringify(response.data)}`);

            // Assuming the success response format remains similar to your previous check
            if (response.data && (response.data[0]?.response === 'send success' || response.data.status === 'success')) {
                return { success: true };
            } else {
                this.logger.warn(`SMS Failed: ${JSON.stringify(response.data)}`);
                throw new BadRequestException('Failed to send OTP');
            }
        } catch (err) {
            this.logger.error(`SMS Error: ${err.message}`);
            throw new BadRequestException('SMS gateway unreachable');
        }
    }
}