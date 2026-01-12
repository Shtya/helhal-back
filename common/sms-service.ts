import { Injectable, BadRequestException } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SmsService {
    private readonly smsApiUrl = 'https://sms.connectsaudi.com/sendurl.aspx';
    private readonly smsUser = process.env.SMS_API_USER;       // e.g. "4865555"
    private readonly smsPassword = process.env.SMS_API_PASSWORD; // e.g. "dff556s66d566"
    private readonly smsKey = process.env.SMS_API_KEY;         // optional key if required
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

        try {
            const response = await axios.get(this.smsApiUrl, { params });
            const result = response.data;
            console.log("response.data: ", response.data)
            // API returns JSON like: [{"msg_id":"12345678","number":"966XXXXXXXXX","response":"send success"}]
            if (Array.isArray(result) && result[0]?.response === 'send success') {
                return { success: true, msgId: result[0].msg_id };
            } else {
                throw new BadRequestException('Failed to send SMS');
            }
        } catch (err) {
            console.error('SMS API error:', err);
            throw new BadRequestException('Error sending SMS via provider');
        }
    }
}
