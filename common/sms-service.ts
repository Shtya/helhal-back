import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SmsService {
    private readonly logger = new Logger(SmsService.name);

    private readonly smsApiUrl = 'https://sms.connectsaudi.com/sendurl.aspx';
    private readonly smsParamUrl = 'http://sms.connectsaudi.com/sendsms_param.aspx';

    private readonly smsUser = process.env.SMS_API_USER;
    private readonly smsPassword = process.env.SMS_API_PASSWORD;
    private readonly smsKey = process.env.SMS_API_KEY;

    async sendOTP(phone: string, dialCode: string, otp: string, expire: number) {
        // Clean the dialCode and phone per your trimming preference
        const cleanDialCode = dialCode.replace('+', '').trim();
        const cleanPhone = phone.trim();
        const fullNumber = `${cleanDialCode}${cleanPhone}`;
        const message = `Your Helhal OTP is (1).It expires in (2) minutes.`;

        const postPayload = {
            user: this.smsUser,
            pwd: this.smsPassword,
            apiKey: this.smsKey,
            numbers: fullNumber,
            sender: "Helhal",
            msg: message,
            lang: "3",
            msgkey: `(1),*,${otp},@,(2),*,${expire}`,
            priority: "High",
            showerror: "C"
        };

        try {
            // Log and Test Structure(POST JSON)
            this.logger.debug(`Structure (POST) url :${this.smsParamUrl},  Payload: ${JSON.stringify({ ...postPayload })}`);
            const resp = await axios.post(this.smsParamUrl, postPayload);
            this.logger.log(`Structure  Response: ${JSON.stringify(resp.data)}`);
            const responseData = resp.data;
            const success = typeof responseData === 'string' && responseData.includes('Send Successful');

            if (success) {
                this.logger.log('SMS Sent Successfully via Structure');
                return { success: true, details: responseData };
            } else {
                this.logger.warn(`Structure Failed. Raw Response: ${responseData}`);
                throw new BadRequestException('Failed to send OTP via provider');
            }

        } catch (err) {
            this.logger.error(`SMS Multi-Structure Error: ${err.message}`);
            if (err.response) {
                this.logger.error(`Provider Error Data: ${JSON.stringify(err.response.data)}`);
            }
            return { success: false };
        }
    }

    //mock
    // async sendOTP(phone: string, dialCode: string, otp: string, expire: number) {

    // }
}