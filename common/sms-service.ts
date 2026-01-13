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

    // async sendOTP(phone: string, dialCode: string, otp: string, expire: number) {
    //     // Clean the dialCode and phone per your trimming preference
    //     const cleanDialCode = dialCode.replace('+', '').trim();
    //     const cleanPhone = phone.trim();
    //     const fullNumber = `${cleanDialCode}${cleanPhone}`;
    //     // const message = `Your Helhal OTP is ${otp}. It expires in ${expire} minutes.`;
    //     // const message2 = `Your Helhal OTP is (1). It expires in (2) minutes.`;
    //     const message = `Test Message`;
    //     const message2 = `Test Message`;

    //     // --- STRUCTURE 1: GET (sendurl.aspx) ---
    //     const getParams = {
    //         user: this.smsUser,
    //         pwd: this.smsPassword,
    //         senderid: "SMSAlert",
    //         mobileno: fullNumber,
    //         msgtext: message,
    //         priority: 'High',
    //         CountryCode: 'ALL',
    //         key: this.smsKey
    //     };

    //     // --- STRUCTURE 2: POST JSON (sendsms_param.aspx) ---
    //     const postPayload = {
    //         user: this.smsUser,
    //         pwd: this.smsPassword,
    //         apiKey: this.smsKey,
    //         numbers: fullNumber,
    //         sender: "MOBSMS",
    //         msg: message2,
    //         lang: "3"
    //         // msgkey is included as per your provided structure for testing
    //         // msgkey: `(1),*,${otp},@,(2),*,${expire}`,
    //         // showerror: "C"
    //     };

    //     try {
    //         // Log and Test Structure 1 (GET)
    //         const fullGetUrl = axios.getUri({ url: this.smsApiUrl, params: getParams });
    //         this.logger.debug(`Testing Structure 1 (GET) URL: ${fullGetUrl}`);
    //         const resp1 = await axios.get(this.smsApiUrl, { params: getParams });
    //         this.logger.log(`Structure 1 Response: ${JSON.stringify(resp1.data)}`);

    //         // Log and Test Structure 2 (POST JSON)
    //         this.logger.debug(`Testing Structure 2 (POST) Payload: ${JSON.stringify({ ...postPayload })}`);
    //         // const resp2 = await axios.post(this.smsParamUrl, postPayload);
    //         // this.logger.log(`Structure 2 Response: ${JSON.stringify(resp2.data)}`);

    //         // Validation Logic (Checks both for a 'send success' indicator)
    //         const success1 = Array.isArray(resp1.data) && resp1.data[0]?.response === 'send success';
    //         // const success2 = resp2.data?.status === 'success' || (Array.isArray(resp2.data) && resp2.data[0]?.response === 'send success');

    //         if (success1) {
    //             return {
    //                 success: true,
    //                 struct1: resp1.data,
    //                 // struct2: resp2.data
    //             };
    //         } else {
    //             throw new Error('Both API structures failed to confirm success');
    //         }

    //     } catch (err) {
    //         this.logger.error(`SMS Multi-Structure Test Error: ${err.message}`);
    //         if (err.response) {
    //             this.logger.error(`Provider Error Data: ${JSON.stringify(err.response.data)}`);
    //         }
    //         throw new BadRequestException('SMS gateway unreachable or configuration error');
    //     }
    // }

    //mock
    async sendOTP(phone: string, dialCode: string, otp: string, expire: number) {

    }
}