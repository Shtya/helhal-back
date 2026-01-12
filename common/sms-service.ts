import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SmsService {
    private readonly logger = new Logger(SmsService.name);

    private readonly smsApiUrl = 'https://sms.connectsaudi.com/sendurl.aspx';
    private readonly smsUser = process.env.SMS_API_USER;
    private readonly smsPassword = process.env.SMS_API_PASSWORD;
    private readonly smsKey = process.env.SMS_API_KEY;
    async sendOTP(phone: string, dialCode: string, otp: string, expire: number) {
        // Clean the dialCode and phone (removing + and spaces)
        const cleanDialCode = dialCode.replace('+', '').trim();
        const cleanPhone = phone.trim();
        const fullNumber = `${cleanDialCode}${cleanPhone}`;

        const message = `Your Helhal OTP is ${otp}. It expires in ${expire} minutes.`;

        // Parameters as per the URL structure: .../sendurl.aspx?user=xxx&pwd=xxx...
        const params = {
            user: this.smsUser,
            pwd: this.smsPassword,
            senderid: "SMSAlert", // Ensure no space if the provider is strict, or use "SMS Alert"
            mobileno: fullNumber,
            msgtext: message,
            priority: 'High',
            CountryCode: 'ALL',
            key: this.smsKey
        };

        this.logger.debug(`Sending OTP to ${fullNumber}`);

        try {
            // Using axios.get to append params to the URL query string
            const response = await axios.get(this.smsApiUrl, { params });

            this.logger.log(`SMS Response: ${JSON.stringify(response.data)}`);

            // The provider returns an array: [{"msg_id":"...","number":"...","response":"send success"}]
            const result = response.data;
            if (Array.isArray(result) && result[0]?.response === 'send success') {
                return { success: true, msgId: result[0].msg_id };
            } else {
                this.logger.warn(`SMS Provider rejected: ${JSON.stringify(result)}`);
                throw new BadRequestException('Failed to send OTP');
            }
        } catch (err) {
            this.logger.error(`SMS API Error: ${err.message}`);
            throw new BadRequestException('SMS gateway unreachable');
        }
    }
}