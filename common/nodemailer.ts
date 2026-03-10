import { Inject, Injectable } from '@nestjs/common';
import { SettingsService } from 'src/settings/settings.service';
import * as nodemailer from 'nodemailer';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { Notification, Setting } from 'entities/global.entity';
import * as path from 'path';

@Injectable()
export class MailService {
    private transporter = nodemailer.createTransport({
        host: process.env.Email_HOST, // اسم الخادم الصادر
        port: process.env.Email_PORT,             // المنفذ
        secure: false,         // false for STARTTLS (TLS)
        requireTLS: true,      // force TLS
        auth: {
            user: process.env.EMAIL_USER, // بريدك الإلكتروني Zoho
            pass: process.env.EMAIL_PASS, // كلمة مرور التطبيق App Password
        }
    });

    constructor(
        private readonly settingsService: SettingsService,
        @Inject(CACHE_MANAGER) private cacheManager: Cache) { }

    private buildFrom(settings?: Setting): string {
        const siteName = settings?.siteName ?? process.env.PROJECT_NAME ?? 'No-Reply';


        return `${siteName} <${process.env.EMAIL_USER}>`;
    }
    getSiteLogo(settings?: Setting): string | null {
        if (!settings?.siteLogo) return null;

        return `
    <table role="presentation" style="margin: 0 auto 25px auto;">
      <tr>
        <td style="padding-right: 8px;">
          <img src="cid:logo" alt="Platform Logo" style="max-width:160px;width:42px;height:42px;vertical-align:middle;" />
        </td>
        <td style="font-family: Arial, sans-serif; font-size:16px; color:#333; vertical-align:middle;">
          ${settings.siteName || "Helhal"}
        </td>
      </tr>
    </table>
  `;
    }


    private async getSettings(): Promise<Setting | null> {
        try {
            let settings = await this.cacheManager.get<Setting>(this.settingsService.CACHE_KEY);
            if (!settings) {
                settings = await this.settingsService.getSettings();
            }
            return settings;
        } catch (err) {
            console.error('Error fetching settings:', err);
            return null;
        }
    }

    async sendOTPEmail(to: string, otp: string, actionType: string) {
        if (!to) return;

        const settings = await this.getSettings();
        const siteName = settings?.siteName ?? 'Helhal';

        const htmlContent = `
    <html>
        <body style="font-family: Arial, sans-serif; color: #172554; background-color: #eff6ff; margin: 0; padding: 0;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; padding: 40px 20px;">
                <tr>
                    <td align="center">
                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; max-width: 600px; border-radius: 12px; border: 1px solid #dbeafe; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);">
                            <tr>
                                <td style="padding: 40px; text-align: center;">
                                    <div style="margin-bottom: 25px;">
                                        ${this.getSiteLogo(settings) || ''}
                                    </div>

                                    <h2 style="font-size: 24px; color: #1e3a8a; margin-bottom: 15px; font-weight: bold;">
                                        Your Verification Code
                                    </h2>

                                    <div style="font-size: 15px; line-height: 1.6; color: #1e40af; margin-bottom: 25px;">
                                        <p>We received a request to <strong>${actionType}</strong>. Use the code below to proceed:</p>
                                    </div>

                                    <table border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 30px 0;">
                                        <tr>
                                            <td align="center" bgcolor="#2563eb" style="padding: 15px 40px; border-radius: 10px;">
                                                <span style="font-size: 36px; font-weight: bold; color: #ffffff; letter-spacing: 6px; display: block;">
                                                    ${otp}
                                                </span>
                                            </td>
                                        </tr>
                                    </table>

                                    <p style="font-size: 13px; color: #60a5fa; margin-top: 20px;">
                                        This code is valid for <strong>5 minutes</strong>. If you did not request this, please ignore this email.
                                    </p>

                                    <div style="font-size: 12px; color: #93c5fd; margin-top: 40px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                                        <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
                                        <p><a href="${process.env.FRONTEND_URL}/privacy-policy" style="color: #2563eb; text-decoration: none;">Privacy Policy</a></p>
                                    </div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
    </html>`;

        await this.transporter.sendMail({
            from: await this.buildFrom(settings),
            to,
            subject: `${actionType} - Verification Code`,
            html: htmlContent,
            attachments: settings.siteLogo ? [{
                filename: 'logo.png',
                path: path.join(process.cwd(), settings.siteLogo.replace(/^\/+/, '')),
                cid: 'logo'
            }] : []
        });
    }

    async sendVerificationEmail(email: string, code: string, username: string) {
        if (!email) return;
        const settings = await this.getSettings();
        const siteName = settings?.siteName ?? 'Helhal';
        const subject = 'Verify Your Email Address';

        const html = `
    <html>
        <body style="font-family: Arial, sans-serif; color: #172554; background-color: #eff6ff; margin: 0; padding: 0;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; padding: 40px 20px;">
                <tr>
                    <td align="center">
                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; max-width: 600px; border-radius: 12px; border: 1px solid #dbeafe; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);">
                            <tr>
                                <td style="padding: 40px; text-align: center;">
                                    <div style="margin-bottom: 25px;">
                                        ${this.getSiteLogo(settings) || ''}
                                    </div>
                                    <h2 style="font-size: 26px; color: #1e3a8a; margin-bottom: 20px; font-weight: bold;">
                                        Welcome, ${username}!
                                    </h2>
                                    <div style="font-size: 16px; line-height: 1.6; color: #1e40af; margin-bottom: 25px;">
                                        <p>Thank you for registering! To complete your profile, please use the verification code below:</p>
                                    </div>
                                    
                                    <table border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 20px 0;">
                                        <tr>
                                            <td align="center" bgcolor="#f8fafc" style="border: 2px dashed #bfdbfe; padding: 15px 40px; border-radius: 8px;">
                                                <span style="font-size: 32px; font-weight: bold; color: #1e3a8a; letter-spacing: 5px;">${code}</span>
                                            </td>
                                        </tr>
                                    </table>

                                    <div style="font-size: 12px; color: #93c5fd; margin-top: 40px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                                        <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
                                    </div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
    </html>`;

        await this.transporter.sendMail({
            from: await this.buildFrom(settings),
            to: email,
            subject,
            html,
            attachments: settings.siteLogo ? [{
                filename: 'logo.png',
                path: path.join(process.cwd(), settings.siteLogo.replace(/^\/+/, '')),
                cid: 'logo'
            }] : []
        });
    }

    async sendPasswordResetOtp(email: string, username: string, otp: string) {
        if (!email) return;
        const subject = 'Password Reset OTP';
        const settings = await this.getSettings();
        const siteName = settings?.siteName ?? 'Helhal';

        const supportEmail = await (async () => {
            try {
                return settings?.contactEmail ?? process.env.SUPPORT_EMAIL ?? process.env.EMAIL_FROM ?? 'support@example.com';
            } catch (err) {
                return process.env.SUPPORT_EMAIL ?? process.env.EMAIL_FROM ?? 'support@example.com';
            }
        })();

        const html = `
    <html>
        <body style="font-family: Arial, sans-serif; color: #172554; background-color: #eff6ff; margin: 0; padding: 0;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; padding: 40px 20px;">
                <tr>
                    <td align="center">
                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; max-width: 600px; border-radius: 12px; border: 1px solid #dbeafe; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);">
                            <tr>
                                <td style="padding: 40px; text-align: center;">
                                    <div style="margin-bottom: 25px;">
                                        ${this.getSiteLogo(settings) || ''}
                                    </div>
                                    <h2 style="font-size: 26px; color: #1e3a8a; margin-bottom: 20px; font-weight: bold;">
                                        Hello ${username},
                                    </h2>
                                    <div style="font-size: 16px; line-height: 1.6; color: #1e40af; margin-bottom: 25px;">
                                        <p>We received a request to reset your password. If you did not make this request, please ignore this email.</p>
                                        <p>Your OTP for resetting your password is:</p>
                                    </div>

                                    <table border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 20px 0;">
                                        <tr>
                                            <td align="center" bgcolor="#2563eb" style="padding: 15px 40px; border-radius: 8px;">
                                                <span style="font-size: 32px; font-weight: bold; color: #ffffff; letter-spacing: 5px;">${otp}</span>
                                            </td>
                                        </tr>
                                    </table>

                                    <p style="font-size: 14px; color: #60a5fa; margin-top: 20px;">
                                        This OTP is valid for 10 minutes.
                                    </p>

                                    <div style="font-size: 12px; color: #93c5fd; margin-top: 40px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                                        <p>If you have any questions, contact our support team <a href="mailto:${supportEmail}" style="color: #2563eb; text-decoration: none;">here</a>.</p>
                                        <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
                                    </div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
    </html>`;

        await this.transporter.sendMail({
            from: await this.buildFrom(settings),
            to: email,
            subject,
            html,
            attachments: settings.siteLogo ? [{
                filename: 'logo.png',
                path: path.join(process.cwd(), settings.siteLogo.replace(/^\/+/, '')),
                cid: 'logo'
            }] : []
        });
    }

    async sendPasswordChangeNotification(userEmail: string, username: string, adminEmail: string) {
        if (!userEmail) return;
        const settings = await this.getSettings();
        const siteName = settings?.siteName ?? 'Helhal';
        const subject = 'Password Changed Successfully';

        const html = `
    <html>
        <body style="font-family: Arial, sans-serif; color: #172554; background-color: #eff6ff; margin: 0; padding: 0;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; padding: 40px 20px;">
                <tr>
                    <td align="center">
                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; max-width: 600px; border-radius: 12px; border: 1px solid #dbeafe; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);">
                            <tr>
                                <td style="padding: 40px; text-align: center;">
                                    <div style="margin-bottom: 25px;">
                                        ${this.getSiteLogo(settings) || ''}
                                    </div>
                                    <h2 style="font-size: 26px; color: #1e3a8a; margin-bottom: 20px; font-weight: bold;">
                                        Hello ${username},
                                    </h2>
                                    <div style="font-size: 16px; line-height: 1.6; color: #1e40af; margin-bottom: 25px;">
                                        <p>Your account password has been successfully changed.</p>
                                        <p style="color: #60a5fa; font-size: 14px;">If you did not perform this change, please contact our support team immediately.</p>
                                    </div>
                                    <div style="font-size: 12px; color: #93c5fd; margin-top: 40px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                                        <p>Contact Admin: <a href="mailto:${adminEmail}" style="color: #2563eb; text-decoration: none;">${adminEmail}</a></p>
                                        <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
                                    </div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
    </html>`;

        await this.transporter.sendMail({
            from: await this.buildFrom(settings),
            to: userEmail,
            subject,
            html,
            attachments: settings.siteLogo ? [{
                filename: 'logo.png',
                path: path.join(process.cwd(), settings.siteLogo.replace(/^\/+/, '')),
                cid: 'logo'
            }] : []
        });
    }

    async sendEmailChangeNotification(userEmail: string, username: string, adminEmail: string) {
        if (!userEmail) return;
        const settings = await this.getSettings();
        const siteName = settings?.siteName ?? 'Helhal';
        const subject = 'Email Address Updated Successfully';

        const html = `
    <html>
        <body style="font-family: Arial, sans-serif; color: #172554; background-color: #eff6ff; margin: 0; padding: 0;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; padding: 40px 20px;">
                <tr>
                    <td align="center">
                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; max-width: 600px; border-radius: 12px; border: 1px solid #dbeafe; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);">
                            <tr>
                                <td style="padding: 40px; text-align: center;">
                                    <div style="margin-bottom: 25px;">
                                        ${this.getSiteLogo(settings) || ''}
                                    </div>
                                    <h2 style="font-size: 26px; color: #1e3a8a; margin-bottom: 20px; font-weight: bold;">
                                        Hello ${username},
                                    </h2>
                                    <div style="font-size: 16px; line-height: 1.6; color: #1e40af; margin-bottom: 25px;">
                                        <p>Your account email address has been successfully updated.</p>
                                        <p style="color: #60a5fa; font-size: 14px;">If you did not request this change, please contact our support team immediately to secure your account.</p>
                                    </div>
                                    <div style="font-size: 12px; color: #93c5fd; margin-top: 40px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                                        <p>Contact Admin: <a href="mailto:${adminEmail}" style="color: #2563eb; text-decoration: none;">${adminEmail}</a></p>
                                        <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
                                    </div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
    </html>`;

        await this.transporter.sendMail({
            from: await this.buildFrom(settings),
            to: userEmail,
            subject,
            html,
            attachments: settings.siteLogo ? [{
                filename: 'logo.png',
                path: path.join(process.cwd(), settings.siteLogo.replace(/^\/+/, '')),
                cid: 'logo'
            }] : []
        });
    }

    async sendEmailChangeConfirmation(email: string, username: string, userId: string, code: string) {
        if (!email) return;
        const subject = 'Confirm Your New Email Address';
        const settings = await this.getSettings();
        const siteName = settings?.siteName ?? 'Helhal';
        const confirmLink = `${process.env.BACKEND_URL}/api/v1/auth/confirm-email-change?userId=${userId}&pendingEmail=${encodeURIComponent(email)}&code=${code}`;

        const html = `
    <html>
        <body style="font-family: Arial, sans-serif; color: #172554; background-color: #eff6ff; margin: 0; padding: 0;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; padding: 40px 20px;">
                <tr>
                    <td align="center">
                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; max-width: 600px; border-radius: 12px; border: 1px solid #dbeafe; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);">
                            <tr>
                                <td style="padding: 40px; text-align: center;">
                                    <div style="margin-bottom: 25px;">
                                        ${this.getSiteLogo(settings) || ''}
                                    </div>
                                    <h2 style="font-size: 26px; color: #1e3a8a; margin-bottom: 20px; font-weight: bold;">
                                        Hello ${username},
                                    </h2>
                                    <div style="font-size: 16px; line-height: 1.6; color: #1e40af; margin-bottom: 25px;">
                                        <p>You requested to change your email address.</p>
                                        <p>Click the button below to confirm your new email:</p>
                                    </div>
                                    <table border="0" cellspacing="0" cellpadding="0" align="center">
                                        <tr>
                                            <td align="center" bgcolor="#2563eb" style="border-radius: 8px;">
                                                <a href="${confirmLink}" target="_blank" style="font-size: 16px; color: #ffffff; text-decoration: none; border-radius: 8px; padding: 12px 25px; border: 1px solid #2563eb; display: inline-block; font-weight: bold;">
                                                    Confirm Email Change
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                    <p style="font-size: 14px; color: #60a5fa; margin-top: 30px;">
                                        If you did not request this change, please ignore this email.
                                    </p>
                                    <div style="font-size: 12px; color: #93c5fd; margin-top: 40px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                                        <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
                                    </div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
    </html>`;

        await this.transporter.sendMail({
            from: await this.buildFrom(settings),
            to: email,
            subject,
            html,
            attachments: settings.siteLogo ? [{
                filename: 'logo.png',
                path: path.join(process.cwd(), settings.siteLogo.replace(/^\/+/, '')),
                cid: 'logo'
            }] : []
        });
    }

    async sendInviteEmail(opts: {
        to: string;
        subject: string;
        senderName: string;
        message: string;
    }) {
        if (!opts.to) return;
        const settings = await this.getSettings();
        const siteName = settings?.siteName ?? process.env.PROJECT_NAME ?? 'Helhal';

        const htmlContent = `
    <html>
        <body style="font-family: Arial, sans-serif; color: #172554; background-color: #eff6ff; margin: 0; padding: 0;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; padding: 40px 20px;">
                <tr>
                    <td align="center">
                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; max-width: 620px; border-radius: 12px; border: 1px solid #dbeafe; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                            <tr>
                                <td style="padding: 40px;">
                                    <div style="margin-bottom: 25px; text-align: center;">
                                        ${this.getSiteLogo(settings) || ''}
                                    </div>
                                    <h2 style="color: #1e3a8a; font-size: 22px; margin-bottom: 15px; text-align: center;">You Have Been Invited!</h2>
                                    <p style="font-size: 16px; color: #1e40af; line-height: 1.6;">
                                        <strong>${opts.senderName}</strong> has invited you to join our platform.
                                    </p>
                                    
                                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f0f7ff; border-left: 4px solid #2563eb; margin: 25px 0; border-radius: 6px;">
                                        <tr>
                                            <td style="padding: 15px; font-style: italic; color: #1e3a8a; font-size: 15px;">
                                                ${opts.message}
                                            </td>
                                        </tr>
                                    </table>

                                    <p style="font-size: 15px; color: #1e40af; line-height: 1.6;">
                                        If you wish to join, simply click the link included above inside the invitation message.
                                    </p>

                                    <div style="font-size: 12px; color: #93c5fd; margin-top: 40px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                                        <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
                                    </div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
    </html>`;

        await this.transporter.sendMail({
            from: await this.buildFrom(settings),
            to: opts.to,
            subject: opts.subject,
            html: htmlContent,
            attachments: settings.siteLogo ? [{
                filename: 'logo.png',
                path: path.join(process.cwd(), settings.siteLogo.replace(/^\/+/, '')),
                cid: 'logo'
            }] : []
        });
    }

    async sendWelcomeEmail(
        email: string,
        username: string,
        role: string
    ) {
        if (!email) return;
        const settings = await this.getSettings();
        const isSeller = role === 'seller';
        const siteName = settings?.siteName ?? 'Helhal';
        const baseUrl = process.env.FRONTEND_URL || 'https://www.helhal.com';

        const subject = isSeller
            ? `Welcome to ${siteName} – Start Selling Today!`
            : `Welcome to ${siteName} – Find the Perfect Freelancer`;

        const mainTitle = isSeller
            ? `Welcome aboard, ${username}!`
            : `Welcome, ${username}!`;

        const roleMessage = isSeller
            ? `
      <p>You’re now part of our growing community of talented professionals.</p>
      <p>Create your services, showcase your skills, and start earning by working with clients from all over the world.</p>
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 20px 0; color: #1e40af;">
        <tr><td>✔ Create and publish your services</td></tr>
        <tr><td>✔ Receive job requests from customers</td></tr>
        <tr><td>✔ Get paid securely for your work</td></tr>
      </table>
    `
            : `
      <p>You’re all set to find skilled professionals for your projects.</p>
      <p>Post jobs, explore top services, and collaborate with trusted freelancers easily.</p>
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 20px 0; color: #1e40af;">
        <tr><td>✔ Explore professional services</td></tr>
        <tr><td>✔ Post job requirements</td></tr>
        <tr><td>✔ Chat directly with sellers</td></tr>
      </table>
    `;

        const ctaText = isSeller ? 'Create Your First Service' : 'Explore Services';
        const ctaLink = isSeller
            ? `${baseUrl}/create-gig`
            : `${baseUrl}/services`;

        const html = `
    <html>
        <body style="font-family: Arial, sans-serif; color: #172554; background-color: #eff6ff; margin: 0; padding: 0;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; padding: 40px 20px;">
                <tr>
                    <td align="center">
                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; max-width: 600px; border-radius: 12px; border: 1px solid #dbeafe; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                            <tr>
                                <td style="padding: 40px; text-align: center;">
                                    <div style="margin-bottom: 25px;">
                                        ${this.getSiteLogo(settings) || ''}
                                    </div>
                                    
                                    <h1 style="font-size: 26px; color: #1e3a8a; margin-bottom: 20px; font-weight: bold;">
                                        ${mainTitle}
                                    </h1>
                                    
                                    <div style="font-size: 16px; line-height: 1.7; color: #1e40af; text-align: left;">
                                        ${roleMessage}
                                    </div>

                                    <table border="0" cellspacing="0" cellpadding="0" align="center" style="margin-top: 30px;">
                                        <tr>
                                            <td align="center" bgcolor="#2563eb" style="border-radius: 30px;">
                                                <a href="${ctaLink}" target="_blank" style="font-size: 16px; color: #ffffff; text-decoration: none; border-radius: 30px; padding: 14px 35px; border: 1px solid #2563eb; display: inline-block; font-weight: bold;">
                                                    ${ctaText}
                                                </a>
                                            </td>
                                        </tr>
                                    </table>

                                    <p style="margin-top: 30px; font-size: 15px; color: #60a5fa;">
                                        If you have any questions, our support team is always here to help.
                                    </p>

                                    <div style="font-size: 12px; color: #93c5fd; margin-top: 40px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                                        <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
                                    </div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
    </html>`;

        await this.transporter.sendMail({
            from: await this.buildFrom(settings),
            to: email,
            subject,
            html,
            attachments: settings.siteLogo ? [
                {
                    filename: 'logo.png',
                    path: path.join(process.cwd(), settings.siteLogo.replace(/^\/+/, '')),
                    cid: 'logo'
                }
            ] : []
        });
    }

    async sendSellerFeePolicyEmail(email: string, username: string) {
        if (!email) return;

        const settings = await this.getSettings();
        // Get the percent from settings, or default to 10
        const feePercent = settings?.sellerServiceFee ?? 10;
        const siteName = settings?.siteName ?? 'Helhal';

        const subject = `Important: Understanding our Seller Fee Structure at ${siteName}`;

        const html = `
<html>
    <body style="font-family: Arial, sans-serif; color: #1e3a8a; line-height: 1.6; background-color: #eff6ff; padding: 20px; margin: 0;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; padding: 20px;">
            <tr>
                <td align="center">
                    <div style="max-width: 600px; margin: auto; background-color: #ffffff; padding: 35px; border-radius: 12px; border: 1px solid #dbeafe; box-shadow: 0 4px 12px rgba(30, 58, 138, 0.05);">
                        <div style="text-align: center; margin-bottom: 25px;">
                            ${this.getSiteLogo(settings) || ''}
                        </div>
                        
                        <h2 style="color: #1e3a8a; text-align: center; font-size: 24px; margin-bottom: 20px;">Transparent Pricing for Sellers</h2>
                        
                        <p>Hello ${username},</p>
                        <p>Welcome to the community! To help you manage your business effectively, we want to provide clear information on how payments and fees work on <strong>${siteName}</strong>.</p>
                        
                        <div style="background-color: #f0f7ff; padding: 20px; border-left: 5px solid #2563eb; margin: 25px 0; border-radius: 4px;">
                            <h3 style="margin-top: 0; color: #1e40af; font-size: 18px;">Our Standard Service Fee: ${feePercent}%</h3>
                            <p style="margin-bottom: 0; color: #1e3a8a;">For every order you complete, a service fee of <strong>${feePercent}%</strong> is deducted from the total order amount.</p>
                        </div>

                        <div style="text-align: center; margin-top: 30px; background-color: #f8fafc; padding: 20px; border-radius: 8px;">
                            <p style="margin-bottom: 15px; color: #475569;">
                                <em>Example: If you sell a service for 
                                <span style="display: inline-flex; align-items: center; gap: 4px; vertical-align: middle;">
                                    <svg style="fill: #1e3a8a" width="14" height="14" viewBox="0 0 160 180" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M93.6632 26.3338C100.414 18.7553 104.563 15.3529 112.713 11.0513V137.247L93.6632 141.184V26.3338Z" />
                                        <path d="M154.529 89.7792C158.478 81.4433 158.943 77.7385 160 69.187L13.9804 100.894C10.5177 108.607 9.40314 112.918 8.86952 120.576L154.529 89.7792Z" />
                                        <path d="M154.529 128.433C158.478 120.097 158.943 116.392 160 107.84L94.3601 121.733C93.8955 129.375 94.4291 133.295 93.8955 140.952L154.529 128.433Z" />
                                        <path d="M154.529 167.08C158.478 158.744 158.943 155.04 160 146.488L100.168 159.477C97.1479 163.645 95.2894 170.591 93.8955 179.6L154.529 167.08Z" />
                                        <path d="M59.5134 153.919C65.3212 146.741 71.3613 137.711 75.5429 130.301L5.11078 145.567C1.64809 153.28 0.533496 157.592 -0.00012207 165.249L59.5134 153.919Z" />
                                    </svg>
                                    100
                                </span>
                                , you will receive 
                                <span style="display: inline-flex; align-items: center; gap: 4px; vertical-align: middle; font-weight: bold; color: #2563eb;">
                                    <svg style="fill: #2563eb" width="14" height="14" viewBox="0 0 160 180" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M93.6632 26.3338C100.414 18.7553 104.563 15.3529 112.713 11.0513V137.247L93.6632 141.184V26.3338Z" />
                                        <path d="M154.529 89.7792C158.478 81.4433 158.943 77.7385 160 69.187L13.9804 100.894C10.5177 108.607 9.40314 112.918 8.86952 120.576L154.529 89.7792Z" />
                                        <path d="M154.529 128.433C158.478 120.097 158.943 116.392 160 107.84L94.3601 121.733C93.8955 129.375 94.4291 133.295 93.8955 140.952L154.529 128.433Z" />
                                        <path d="M154.529 167.08C158.478 158.744 158.943 155.04 160 146.488L100.168 159.477C97.1479 163.645 95.2894 170.591 93.8955 179.6L154.529 167.08Z" />
                                        <path d="M59.5134 153.919C65.3212 146.741 71.3613 137.711 75.5429 130.301L5.11078 145.567C1.64809 153.28 0.533496 157.592 -0.00012207 165.249L59.5134 153.919Z" />
                                    </svg>
                                    ${100 - (100 * (feePercent / 100))}
                                </span>
                                after the platform fee.</em>
                            </p>
                            
                            <a href="${process.env.FRONTEND_URL}/create-gig" 
                               style="display: inline-block; margin-top: 10px; padding: 14px 30px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; box-shadow: 0 4px 6px rgba(37, 99, 235, 0.2);">
                                Start Listing Your Services
                            </a>
                        </div>
                        
                        <p style="font-size: 12px; color: #94a3b8; margin-top: 40px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                            &copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.
                        </p>
                    </div>
                </td>
            </tr>
        </table>
    </body>
</html>`;

        await this.transporter.sendMail({
            from: await this.buildFrom(settings),
            to: email,
            subject,
            html,
            attachments: [
                {
                    filename: 'logo.png',
                    path: path.join(process.cwd(), settings.siteLogo.replace(/^\/+/, '')),
                    cid: 'logo'
                    // must match the src 
                }
            ]
        });
    }

    // MailService.ts

    async sendNotificationEmail(email: string, username: string, notification: Notification, subRoute?: string) {
        if (!email) return;
        const settings = await this.getSettings();
        const subject = notification.title;
        const supportEmail = settings?.contactEmail ?? process.env.SUPPORT_EMAIL ?? 'support@example.com';

        // 1. تصحيح الرابط (تأكد من عدم التكرار)
        const baseUrl = process.env.FRONTEND_URL || 'https://www.helhal.com';
        const fullLink = subRoute ? `${baseUrl.replace(/\/$/, '')}/${subRoute.replace(/^\//, '')}` : null;

        const html = `
    <html>
        <head>
            </head>
        <body style="font-family: Arial, sans-serif; color: #172554; background-color: #eff6ff; margin: 0; padding: 0;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; padding: 40px 20px;">
                <tr>
                    <td align="center">
                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; max-width: 600px; ">
                            <tr>
                                <td style="padding: 40px;">
                                    <div style="margin-bottom: 25px;">
                                        ${this.getSiteLogo(settings) || ''}
                                    </div>
                                    
                                    <h1 style="font-size: 24px; color: #1e3a8a; margin-bottom: 16px; font-weight: 700;">${notification.title}</h1>
                                    
                                    <div style="font-size: 16px; line-height: 1.7; color: #1e40af;">
                                        <p style="font-weight: bold; font-size: 18px; color: #172554;">Hello ${username},</p>
                                        <p>${notification.message}</p>
                                    </div>

                                    ${fullLink ? `
                                    <table border="0" cellspacing="0" cellpadding="0" style="margin-top: 25px;">
                                        <tr>
                                            <td align="center" bgcolor="#2563eb" style="border-radius: 8px;">
                                                <a href="${fullLink}" target="_blank" style="font-size: 16px; font-family: Helvetica, Arial, sans-serif; color: #ffffff; text-decoration: none; border-radius: 8px; padding: 14px 32px; border: 1px solid #2563eb; display: inline-block; font-weight: 600;">
                                                    View Details
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                    ` : ''}

                                    <div style="font-size: 13px; color: #60a5fa; margin-top: 35px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                                        <p>You received this because of your notification settings at Helhal.</p>
                                        <p>Need help? Contact <a href="mailto:${supportEmail}" style="color: #3b82f6; text-decoration: none;">Support Team</a></p>
                                    </div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
    </html>`;

        await this.transporter.sendMail({
            from: await this.buildFrom(settings),
            to: email,
            subject,
            html,
            attachments: settings.siteLogo ? [{
                filename: 'logo.png',
                path: path.join(process.cwd(), settings.siteLogo.replace(/^\/+/, '')),
                cid: 'logo'
            }] : []
        });
    }
}


