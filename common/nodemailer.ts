import { Inject, Injectable } from '@nestjs/common';
import { SettingsService } from 'src/settings/settings.service';
import * as nodemailer from 'nodemailer';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { Notification, Setting } from 'entities/global.entity';
import * as path from 'path';
import { TranslationService } from './translation.service';

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
        @Inject(CACHE_MANAGER) private cacheManager: Cache,
        private readonly i18n: TranslationService,) { }

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
          <img src="https://www.helhal.com/logo.png" alt="Platform Logo" style="max-width:160px;width:42px;height:42px;vertical-align:middle;" />
        </td>
        <td style="font-size:16px; color:#333; vertical-align:middle;">
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

    async sendOTPEmail(to: string, otp: string, actionType: string, lang?: string) {
        if (!to) return;

        const settings = await this.getSettings();
        const siteName = settings?.siteName ?? 'Helhal';
        const isAr = lang !== 'en';
        const htmlContent = `
            <!DOCTYPE html>
<html lang="${lang || 'ar'}" dir="${isAr ? 'rtl' : 'ltr'}">
        <head>
    <meta charset="UTF-8">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        
        /* Fallback for clients that don't support @import */
        body, table, td {
            font-family: 'Inter', ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        }
    </style>
        <body style="color: #172554; background-color: #eff6ff; margin: 0; padding: 0;">
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
                                        ${this.i18n.t('auth.messages.mail.otp.title', { lang, })}
                                    </h2>

                                    <div style="font-size: 15px; line-height: 1.6; color: #1e40af; margin-bottom: 25px;">
                                        <p>${this.i18n.t('auth.messages.mail.otp.body', { lang, args: { actionType } })}</p>
                                    </div>

                                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                    <tr>
                                        <td align="center">
                                        <table border="0" cellspacing="0" cellpadding="0" style="margin: 30px auto; display: inline-table;">
                                            <tr>
                                            <td align="center" bgcolor="#2563eb" style="padding: 15px 40px; border-radius: 10px;">
                                                <span style="font-size: 36px; font-weight: bold; color: #ffffff; letter-spacing: 6px; display: block;">
                                                ${otp.trim()}
                                                </span>
                                            </td>
                                            </tr>
                                        </table>
                                        </td>
                                    </tr>
                                    </table>

                                    <p style="font-size: 13px; color: #60a5fa; margin-top: 20px;">
                                        ${this.i18n.t('auth.messages.mail.otp.footer', { lang, })}
                                    </p>

                                    <div style="font-size: 12px; color: #93c5fd; margin-top: 40px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                                        <p>&copy; ${new Date().getFullYear()} ${siteName}. ${this.i18n.t('auth.messages.mail.common.reserved', { lang, })}</p>
                                        <p><a href="${process.env.FRONTEND_URL}/privacy-policy" style="color: #2563eb; text-decoration: none;">${this.i18n.t('auth.messages.mail.common.privacy_policy', { lang, })}</a></p>
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
            subject: this.i18n.t('auth.messages.mail.otp.subject', { lang, args: { actionType } }),
            html: htmlContent,
            // attachments: settings.siteLogo ? [{
            //     filename: 'logo.png',
            //     path: path.join(process.cwd(), settings.siteLogo.replace(/^\/+/, '')),
            //     cid: 'logo'
            // }] : []
        });
    }

    async sendVerificationEmail(email: string, code: string, username: string, lang?: string) {
        if (!email) return;
        const settings = await this.getSettings();
        const siteName = settings?.siteName ?? 'Helhal';
        const subject = this.i18n.t('auth.messages.mail.verification.subject', { lang, });
        const isAr = lang !== 'en';
        const html = `
            <!DOCTYPE html>
<html lang="${lang || 'ar'}" dir="${isAr ? 'rtl' : 'ltr'}">
        <head>
    <meta charset="UTF-8">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        
        /* Fallback for clients that don't support @import */
        body, table, td {
            font-family: 'Inter', ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        }
    </style>
        <body style="color: #172554; background-color: #eff6ff; margin: 0; padding: 0;">
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
                                        ${this.i18n.t('auth.messages.mail.verification.title', { lang, args: { username } })}
                                    </h2>
                                    <div style="font-size: 16px; line-height: 1.6; color: #1e40af; margin-bottom: 25px;">
                                        <p>${this.i18n.t('auth.messages.mail.verification.body', { lang, })}</p>
                                    </div>
                                    
                                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                    <tr>
                                        <td align="center">
                                        <table border="0" cellspacing="0" cellpadding="0" style="margin: 30px auto; display: inline-table;">
                                            <tr>
                                            <td align="center" bgcolor="#2563eb" style="padding: 15px 40px; border-radius: 10px;">
                                                <span style="font-size: 36px; font-weight: bold; color: #ffffff; letter-spacing: 6px; display: block;">
                                                ${code}
                                                </span>
                                            </td>
                                            </tr>
                                        </table>
                                        </td>
                                    </tr>
                                    </table>

                                    <div style="font-size: 12px; color: #93c5fd; margin-top: 40px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                                        <p>&copy; ${new Date().getFullYear()} ${siteName}. ${this.i18n.t('auth.messages.mail.common.reserved', { lang, })}</p>
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
            // attachments: settings.siteLogo ? [{
            //     filename: 'logo.png',
            //     path: path.join(process.cwd(), settings.siteLogo.replace(/^\/+/, '')),
            //     cid: 'logo'
            // }] : []
        });
    }

    async sendPasswordResetOtp(email: string, username: string, otp: string, lang?: string) {
        if (!email) return;
        const subject = this.i18n.t('auth.messages.mail.password_reset.subject', { lang, });
        const settings = await this.getSettings();
        const siteName = settings?.siteName ?? 'Helhal';

        const supportEmail = await (async () => {
            try {
                return settings?.contactEmail ?? process.env.SUPPORT_EMAIL ?? process.env.EMAIL_FROM ?? 'support@example.com';
            } catch (err) {
                return process.env.SUPPORT_EMAIL ?? process.env.EMAIL_FROM ?? 'support@example.com';
            }
        })();
        const isAr = lang !== 'en';
        const html = `
            <!DOCTYPE html>
<html lang="${lang || 'ar'}" dir="${isAr ? 'rtl' : 'ltr'}">
        <head>
    <meta charset="UTF-8">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        
        /* Fallback for clients that don't support @import */
        body, table, td {
            font-family: 'Inter', ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        }
    </style>
        <body style="color: #172554; background-color: #eff6ff; margin: 0; padding: 0;">
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
                                        ${this.i18n.t('auth.messages.mail.password_reset.title', { lang, args: { username } })}
                                    </h2>
                                    <div style="font-size: 16px; line-height: 1.6; color: #1e40af; margin-bottom: 25px;">
                                        <p>${this.i18n.t('auth.messages.mail.password_reset.body1', { lang, })}</p>
                                        <p>${this.i18n.t('auth.messages.mail.password_reset.body2', { lang, })}</p>
                                    </div>

                                   <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                    <tr>
                                        <td align="center">
                                        <table border="0" cellspacing="0" cellpadding="0" style="margin: 30px auto; display: inline-table;">
                                            <tr>
                                            <td align="center" bgcolor="#2563eb" style="padding: 15px 40px; border-radius: 10px;">
                                                <span style="font-size: 36px; font-weight: bold; color: #ffffff; letter-spacing: 6px; display: block;">
                                                ${otp.trim()}
                                                </span>
                                            </td>
                                            </tr>
                                        </table>
                                        </td>
                                    </tr>
                                    </table>
                                    <p style="font-size: 14px; color: #60a5fa; margin-top: 20px;">
                                        ${this.i18n.t('auth.messages.mail.password_reset.footer', { lang, })}
                                    </p>

                                    <div style="font-size: 12px; color: #93c5fd; margin-top: 40px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                                        <p>${this.i18n.t('auth.messages.mail.common.contact_support_here', { lang, args: { email: supportEmail } })}</p>
                                        <p>&copy; ${new Date().getFullYear()} ${siteName}. ${this.i18n.t('auth.messages.mail.common.reserved', { lang, })}</p>
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
            // attachments: settings.siteLogo ? [{
            //     filename: 'logo.png',
            //     path: path.join(process.cwd(), settings.siteLogo.replace(/^\/+/, '')),
            //     cid: 'logo'
            // }] : []
        });
    }

    async sendPasswordChangeNotification(userEmail: string, username: string, adminEmail: string, lang?: string) {
        if (!userEmail) return;
        const settings = await this.getSettings();
        const siteName = settings?.siteName ?? 'Helhal';
        const subject = this.i18n.t('auth.messages.mail.password_changed.subject', { lang, });
        const isAr = lang !== 'en';
        const html = `
            <!DOCTYPE html>
<html lang="${lang || 'ar'}" dir="${isAr ? 'rtl' : 'ltr'}">
        <head>
    <meta charset="UTF-8">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        
        /* Fallback for clients that don't support @import */
        body, table, td {
            font-family: 'Inter', ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        }
    </style>
        <body style="color: #172554; background-color: #eff6ff; margin: 0; padding: 0;">
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
                                        ${this.i18n.t('auth.messages.mail.password_changed.title', { lang, args: { username } })}
                                    </h2>
                                    <div style="font-size: 16px; line-height: 1.6; color: #1e40af; margin-bottom: 25px;">
                                        <p>${this.i18n.t('auth.messages.mail.password_changed.body1', { lang, })}</p>
                                        <p style="color: #60a5fa; font-size: 14px;">${this.i18n.t('auth.messages.mail.password_changed.body2', { lang, })}</p>
                                    </div>
                                    <div style="font-size: 12px; color: #93c5fd; margin-top: 40px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                                        <p>${this.i18n.t('auth.messages.mail.common.contact_admin', { lang, })} <a href="mailto:${adminEmail}" style="color: #2563eb; text-decoration: none;">${adminEmail}</a></p>
                                        <p>&copy; ${new Date().getFullYear()} ${siteName}. ${this.i18n.t('auth.messages.mail.common.reserved', { lang, })}</p>
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
            // attachments: settings.siteLogo ? [{
            //     filename: 'logo.png',
            //     path: path.join(process.cwd(), settings.siteLogo.replace(/^\/+/, '')),
            //     cid: 'logo'
            // }] : []
        });
    }

    async sendEmailChangeNotification(userEmail: string, username: string, adminEmail: string, lang?: string) {
        if (!userEmail) return;
        const settings = await this.getSettings();
        const siteName = settings?.siteName ?? 'Helhal';
        const subject = this.i18n.t('auth.messages.mail.email_changed.subject', { lang, });
        const isAr = lang !== 'en';
        const html = `
            <!DOCTYPE html>
<html lang="${lang || 'ar'}" dir="${isAr ? 'rtl' : 'ltr'}">
        <head>
    <meta charset="UTF-8">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        
        /* Fallback for clients that don't support @import */
        body, table, td {
            font-family: 'Inter', ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        }
    </style>
        <body style="color: #172554; background-color: #eff6ff; margin: 0; padding: 0;">
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
                                        ${this.i18n.t('auth.messages.mail.email_changed.title', { lang, args: { username } })}
                                    </h2>
                                    <div style="font-size: 16px; line-height: 1.6; color: #1e40af; margin-bottom: 25px;">
                                        <p>${this.i18n.t('auth.messages.mail.email_changed.body1', { lang, })}</p>
                                        <p style="color: #60a5fa; font-size: 14px;">${this.i18n.t('auth.messages.mail.email_changed.body2', { lang, })}</p>
                                    </div>
                                    <div style="font-size: 12px; color: #93c5fd; margin-top: 40px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                                        <p>${this.i18n.t('auth.messages.mail.common.contact_admin', { lang, })} <a href="mailto:${adminEmail}" style="color: #2563eb; text-decoration: none;">${adminEmail}</a></p>
                                        <p>&copy; ${new Date().getFullYear()} ${siteName}. ${this.i18n.t('auth.messages.mail.common.reserved', { lang, })}</p>
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
            // attachments: settings.siteLogo ? [{
            //     filename: 'logo.png',
            //     path: path.join(process.cwd(), settings.siteLogo.replace(/^\/+/, '')),
            //     cid: 'logo'
            // }] : []
        });
    }

    async sendEmailChangeConfirmation(email: string, username: string, userId: string, code: string, lang?: string) {
        if (!email) return;
        const subject = this.i18n.t('auth.messages.mail.email_change_confirmation.subject', { lang, });
        const settings = await this.getSettings();
        const siteName = settings?.siteName ?? 'Helhal';
        const confirmLink = `${process.env.BACKEND_URL}/api/v1/auth/confirm-email-change?userId=${userId}&pendingEmail=${encodeURIComponent(email)}&code=${code}`;
        const isAr = lang !== 'en';
        const html = `
            <!DOCTYPE html>
<html lang="${lang || 'ar'}" dir="${isAr ? 'rtl' : 'ltr'}">
        <head>
    <meta charset="UTF-8">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        
        /* Fallback for clients that don't support @import */
        body, table, td {
            font-family: 'Inter', ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        }
    </style>
        <body style="color: #172554; background-color: #eff6ff; margin: 0; padding: 0;">
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
                                        ${this.i18n.t('auth.messages.mail.email_change_confirmation.title', { lang, args: { username } })}
                                    </h2>
                                    <div style="font-size: 16px; line-height: 1.6; color: #1e40af; margin-bottom: 25px;">
                                        <p>${this.i18n.t('auth.messages.mail.email_change_confirmation.body1', { lang, })}</p>
                                        <p>${this.i18n.t('auth.messages.mail.email_change_confirmation.body2', { lang, })}</p>
                                    </div>
                                    <table border="0" cellspacing="0" cellpadding="0" align="center">
                                        <tr>
                                            <td align="center" bgcolor="#2563eb" style="border-radius: 8px;">
                                                <a href="${confirmLink}" target="_blank" style="font-size: 16px; color: #ffffff; text-decoration: none; border-radius: 8px; padding: 12px 25px; border: 1px solid #2563eb; display: inline-block; font-weight: bold;">
                                                    ${this.i18n.t('auth.messages.mail.email_change_confirmation.button', { lang, })}
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                    <p style="font-size: 14px; color: #60a5fa; margin-top: 30px;">
                                        ${this.i18n.t('auth.messages.mail.email_change_confirmation.footer', { lang, })}
                                    </p>
                                    <div style="font-size: 12px; color: #93c5fd; margin-top: 40px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                                        <p>&copy; ${new Date().getFullYear()} ${siteName}. ${this.i18n.t('auth.messages.mail.common.reserved', { lang, })}</p>
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
            // attachments: settings.siteLogo ? [{
            //     filename: 'logo.png',
            //     path: path.join(process.cwd(), settings.siteLogo.replace(/^\/+/, '')),
            //     cid: 'logo'
            // }] : []
        });
    }

    async sendInviteEmail(opts: { to: string; subject: string; senderName: string; message: string; lang?: string }) {
        if (!opts.to) return;
        const settings = await this.getSettings();
        const siteName = settings?.siteName ?? process.env.PROJECT_NAME ?? 'Helhal';
        const isAr = opts.lang !== 'en';
        const htmlContent = `
            <!DOCTYPE html>
<html lang="${opts.lang || 'ar'}" dir="${isAr ? 'rtl' : 'ltr'}">
        <head>
    <meta charset="UTF-8">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        
        /* Fallback for clients that don't support @import */
        body, table, td {
            font-family: 'Inter', ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        }
    </style>
        <body style="color: #172554; background-color: #eff6ff; margin: 0; padding: 0;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; padding: 40px 20px;">
                <tr>
                    <td align="center">
                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; max-width: 620px; border-radius: 12px; border: 1px solid #dbeafe; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                            <tr>
                                <td style="padding: 40px;">
                                    <div style="margin-bottom: 25px; text-align: center;">
                                        ${this.getSiteLogo(settings) || ''}
                                    </div>
                                    <h2 style="color: #1e3a8a; font-size: 22px; margin-bottom: 15px; text-align: center;">${this.i18n.t('auth.messages.mail.invite.title', { lang: opts.lang })}</h2>
                                    <p style="font-size: 16px; color: #1e40af; line-height: 1.6;">
                                        ${this.i18n.t('auth.messages.mail.invite.body', { lang: opts.lang, args: { senderName: opts.senderName } })}
                                    </p>
                                    
                                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f0f7ff; border-left: 4px solid #2563eb; margin: 25px 0; border-radius: 6px;">
                                        <tr>
                                            <td style="padding: 15px; font-style: italic; color: #1e3a8a; font-size: 15px;">
                                                ${opts.message}
                                            </td>
                                        </tr>
                                    </table>

                                    <p style="font-size: 15px; color: #1e40af; line-height: 1.6;">
                                        ${this.i18n.t('auth.messages.mail.invite.instruction', { lang: opts.lang, })}
                                    </p>

                                    <div style="font-size: 12px; color: #93c5fd; margin-top: 40px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                                        <p>&copy; ${new Date().getFullYear()} ${siteName}. ${this.i18n.t('auth.messages.mail.common.reserved', { lang: opts.lang })}</p>
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
            // attachments: settings.siteLogo ? [{
            //     filename: 'logo.png',
            //     path: path.join(process.cwd(), settings.siteLogo.replace(/^\/+/, '')),
            //     cid: 'logo'
            // }] : []
        });
    }

    async sendWelcomeEmail(email: string, username: string, role: string, lang?: string) {
        if (!email) return;
        const settings = await this.getSettings();
        const isSeller = role === 'seller';
        const siteName = settings?.siteName ?? 'Helhal';
        const baseUrl = process.env.FRONTEND_URL || 'https://www.helhal.com';

        const subject = isSeller
            ? this.i18n.t('auth.messages.mail.welcome.subject_seller', { lang, args: { siteName } })
            : this.i18n.t('auth.messages.mail.welcome.subject_buyer', { lang, args: { siteName } });

        const mainTitle = isSeller
            ? this.i18n.t('auth.messages.mail.welcome.title_seller', { lang, args: { username } })
            : this.i18n.t('auth.messages.mail.welcome.title_buyer', { lang, args: { username } });

        const roleMessage = isSeller
            ? `
      <p>${this.i18n.t('auth.messages.mail.welcome.body_seller_p1', { lang, })}</p>
      <p>${this.i18n.t('auth.messages.mail.welcome.body_seller_p2', { lang, })}</p>
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 20px 0; color: #1e40af;">
        <tr><td>✔ ${this.i18n.t('auth.messages.mail.welcome.body_seller_li1', { lang, })}</td></tr>
        <tr><td>✔ ${this.i18n.t('auth.messages.mail.welcome.body_seller_li2', { lang, })}</td></tr>
        <tr><td>✔ ${this.i18n.t('auth.messages.mail.welcome.body_seller_li3', { lang, })}</td></tr>
      </table>
    `
            : `
      <p>${this.i18n.t('auth.messages.mail.welcome.body_buyer_p1', { lang, })}</p>
      <p>${this.i18n.t('auth.messages.mail.welcome.body_buyer_p2', { lang, })}</p>
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 20px 0; color: #1e40af;">
        <tr><td>✔ ${this.i18n.t('auth.messages.mail.welcome.body_buyer_li1', { lang, })}</td></tr>
        <tr><td>✔ ${this.i18n.t('auth.messages.mail.welcome.body_buyer_li2', { lang, })}</td></tr>
        <tr><td>✔ ${this.i18n.t('auth.messages.mail.welcome.body_buyer_li3', { lang, })}</td></tr>
      </table>
    `;

        const ctaText = isSeller
            ? this.i18n.t('auth.messages.mail.welcome.cta_seller', { lang, })
            : this.i18n.t('auth.messages.mail.welcome.cta_buyer', { lang, });
        const ctaLink = isSeller
            ? `${baseUrl}/create-gig`
            : `${baseUrl}/services`;
        const isAr = lang !== 'en';
        const html = `
            <!DOCTYPE html>
<html lang="${lang || 'ar'}" dir="${isAr ? 'rtl' : 'ltr'}">
        <head>
    <meta charset="UTF-8">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        
        /* Fallback for clients that don't support @import */
        body, table, td {
            font-family: 'Inter', ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        }
    </style>
        <body style="color: #172554; background-color: #eff6ff; margin: 0; padding: 0;">
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
                                        ${this.i18n.t('auth.messages.mail.common.support_team_help', { lang, })}
                                    </p>

                                    <div style="font-size: 12px; color: #93c5fd; margin-top: 40px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                                        <p>&copy; ${new Date().getFullYear()} ${siteName}. ${this.i18n.t('auth.messages.mail.common.reserved', { lang, })}</p>
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
            // attachments: settings.siteLogo ? [
            //     {
            //         filename: 'logo.png',
            //         path: path.join(process.cwd(), settings.siteLogo.replace(/^\/+/, '')),
            //         cid: 'logo'
            // }
            // ] : []
        });
    }

    async sendSellerFeePolicyEmail(email: string, username: string, lang?: string) {
        if (!email) return;

        const settings = await this.getSettings();
        // Get the percent from settings, or default to 10
        const feePercent = settings?.sellerServiceFee ?? 10;
        const siteName = settings?.siteName ?? 'Helhal';

        const subject = this.i18n.t('auth.messages.mail.seller_fee_policy.subject', { lang, args: { siteName } });
        const isAr = lang !== 'en';
        const html = `
        <!DOCTYPE html>
<html lang="${lang || 'ar'}" dir="${isAr ? 'rtl' : 'ltr'}">
        <head>
    <meta charset="UTF-8">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        
        /* Fallback for clients that don't support @import */
        body, table, td {
            font-family: 'Inter', ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        }
    </style>
    <body style="color: #1e3a8a; line-height: 1.6; background-color: #eff6ff; padding: 20px; margin: 0;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; padding: 20px;">
            <tr>
                <td align="center">
                    <div style="max-width: 600px; margin: auto; background-color: #ffffff; padding: 35px; border-radius: 12px; border: 1px solid #dbeafe; box-shadow: 0 4px 12px rgba(30, 58, 138, 0.05);">
                        <div style="text-align: center; margin-bottom: 25px;">
                            ${this.getSiteLogo(settings) || ''}
                        </div>
                        
                        <h2 style="color: #1e3a8a; text-align: center; font-size: 24px; margin-bottom: 20px;">${this.i18n.t('auth.messages.mail.seller_fee_policy.title', { lang, })}</h2>
                        
                        <p>${this.i18n.t('auth.messages.mail.seller_fee_policy.greeting', { lang, args: { username } })}</p>
                        <p>${this.i18n.t('auth.messages.mail.seller_fee_policy.body1', { lang, args: { siteName } })}</p>
                        
                        <div style="background-color: #f0f7ff; padding: 20px; border-left: 5px solid #2563eb; margin: 25px 0; border-radius: 4px;">
                            <h3 style="margin-top: 0; color: #1e40af; font-size: 18px;">${this.i18n.t('auth.messages.mail.seller_fee_policy.fee_title', { lang, args: { feePercent } })}</h3>
                            <p style="margin-bottom: 0; color: #1e3a8a;">${this.i18n.t('auth.messages.mail.seller_fee_policy.fee_body', { lang, args: { feePercent } })}</p>
                        </div>

                        <div style="text-align: center; margin-top: 30px; background-color: #f8fafc; padding: 20px; border-radius: 8px;">
                            <p style="margin-bottom: 15px; color: #475569;">
                                <em>${this.i18n.t('auth.messages.mail.seller_fee_policy.example', {
            lang,
            args: {
                amount: 100,
                receivedAmount: 100 - (100 * (feePercent / 100))
            }
        })}</em>
                            </p>
                            
                            <a href="${process.env.FRONTEND_URL}/create-gig" 
                               style="display: inline-block; margin-top: 10px; padding: 14px 30px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; box-shadow: 0 4px 6px rgba(37, 99, 235, 0.2);">
                                ${this.i18n.t('auth.messages.mail.seller_fee_policy.cta', { lang, })}
                            </a>
                        </div>
                        
                        <p style="font-size: 12px; color: #94a3b8; margin-top: 40px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                            &copy; ${new Date().getFullYear()} ${siteName}. ${this.i18n.t('auth.messages.mail.common.reserved', { lang, })}
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

    async sendNotificationEmail(email: string, username: string, notification: Notification, lang?: string, subRoute?: string) {
        if (!email) return;
        const settings = await this.getSettings();
        const subject = notification.title;
        const supportEmail = settings?.contactEmail ?? process.env.SUPPORT_EMAIL ?? 'support@example.com';

        // 1. تصحيح الرابط (تأكد من عدم التكرار)
        const baseUrl = process.env.FRONTEND_URL || 'https://www.helhal.com';
        const fullLink = subRoute ? `${baseUrl.replace(/\/$/, '')}/${subRoute.replace(/^\//, '')}` : null;
        const isAr = lang !== 'en';
        const html = `
            <!DOCTYPE html>
<html lang="${lang || 'ar'}" dir="${isAr ? 'rtl' : 'ltr'}">
        <head>
    <meta charset="UTF-8">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        
        /* Fallback for clients that don't support @import */
        body, table, td {
            font-family: 'Inter', ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        }
    </style>
        <head>
            </head>
        <body style="color: #172554; background-color: #eff6ff; margin: 0; padding: 0;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; padding: 40px 20px;">
                <tr>
                    <td align="center"> <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; max-width: 600px; margin: 0 auto;">
                            <tr>
                                <td style="padding: 40px;" align="center"> <div style="margin-bottom: 25px;">
                                        ${this.getSiteLogo(settings) || ''}
                                    </div>
                                    
                                    <h1 style="font-size: 24px; color: #1e3a8a; margin-bottom: 16px; font-weight: 700;">${notification.title}</h1>
                                    
                                    <div style="font-size: 16px; line-height: 1.7; color: #1e40af;">
                                        <p style="font-weight: bold; font-size: 18px; color: #172554;">${this.i18n.t('auth.messages.mail.notification.greeting', { lang, args: { username: username?.trim() } })}</p>
                                        <p>${notification.message}</p>
                                    </div>

                                    ${fullLink ? `
                                    <table border="0" cellspacing="0" cellpadding="0" style="margin: 25px auto 0;" align="center">
                                        <tr>
                                            <td align="center" bgcolor="#2563eb" style="border-radius: 8px;">
                                                <a href="${fullLink.trim()}" target="_blank" style="font-size: 16px; color: #ffffff; text-decoration: none; border-radius: 8px; padding: 14px 32px; border: 1px solid #2563eb; display: inline-block; font-weight: 600;">
                                                    ${this.i18n.t('auth.messages.mail.common.view_details', { lang, })}
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                    ` : ''}

                                    <div style="font-size: 13px; color: #60a5fa; margin-top: 35px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                                        <p>${this.i18n.t('auth.messages.mail.common.received_due_to_settings', { lang, })}</p>
                                        <p>${this.i18n.t('auth.messages.mail.common.need_help_contact_support', { lang, args: { email: supportEmail?.trim() } })}</p>
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
            // attachments: settings.siteLogo ? [{
            //     filename: 'logo.png',
            //     path: path.join(process.cwd(), settings.siteLogo.replace(/^\/+/, '')),
            //     cid: 'logo'
            // }] : []
        });
    }

    async sendNewMessageEmail(to: string, senderName: string, senderId: string, message: string, lang?: string) {
        if (!to) return;

        const settings = await this.getSettings();
        const siteName = settings?.siteName ?? process.env.PROJECT_NAME ?? 'Helhal';
        const supportEmail = settings?.contactEmail ?? process.env.SUPPORT_EMAIL ?? 'support@example.com';

        // 1. Construct the redirect link with trimmed ID
        const baseUrl = process.env.FRONTEND_URL || 'https://www.helhal.com';
        // Using the subRoute logic structure you requested: /chat?user=:senderId
        const fullLink = `${baseUrl.replace(/\/$/, '')}/chat?user=${senderId.trim()}`;

        // 2. Formatting the Date
        const sendDate = new Date().toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
        const isAr = lang !== 'en';
        const htmlContent = `
        <!DOCTYPE html>
<html lang="${lang || 'ar'}" dir="${isAr ? 'rtl' : 'ltr'}">
        <head>
    <meta charset="UTF-8">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        
        /* Fallback for clients that don't support @import */
        body, table, td {
            font-family: 'Inter', ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        }
    </style>
</head>
    <body style="color: #172554; font-family: 'Inter', ui-sans-serif, -apple-system, system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;" background-color: #eff6ff; margin: 0; padding: 0;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; padding: 40px 20px;">
            <tr>
                <td align="center">
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; max-width: 620px; border-radius: 12px; border: 1px solid #dbeafe; box-shadow: 0 4px 12px rgba(0,0,0,0.05); margin: 0 auto;">
                        <tr>
                            <td style="padding: 40px;" align="center">
                                <div style="margin-bottom: 25px; text-align: center;">
                                    ${this.getSiteLogo(settings) || ''}
                                </div>

                                <h2 style="color: #1e3a8a; font-size: 22px; margin-bottom: 15px; text-align: center;">
                                    ${this.i18n.t('auth.messages.mail.new_message.title', { lang })}
                                </h2>
                                
                                <p style="font-size: 16px; color: #1e40af; line-height: 1.6; text-align: center;">
                                    ${this.i18n.t('auth.messages.mail.new_message.body', { lang, args: { senderName: senderName.trim() } })}
                                </p>

                                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f0f7ff; border-left: 4px solid #2563eb; margin: 25px 0; border-radius: 6px;">
                                    <tr>
                                        <td style="padding: 20px; text-align: ${lang === 'ar' ? 'right' : 'left'};">
                                            <div style="font-style: italic; color: #1e3a8a; font-size: 16px; margin-bottom: 15px; line-height: 1.5;">
                                                "${message.trim()}"
                                            </div>
                                            
                                            <div style="border-top: 1px solid #dbeafe; padding-top: 10px; margin-top: 10px;">
                                                <span style="font-size: 12px; color: #60a5fa; font-weight: bold; text-transform: uppercase;">
                                                    ${this.i18n.t('auth.messages.mail.common.sent_at', { lang })}: 
                                                </span>
                                                <span style="font-size: 12px; color: #1e40af;">
                                                    ${sendDate}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                </table>

                                <table border="0" cellspacing="0" cellpadding="0" style="margin: 25px auto 0;" align="center">
                                    <tr>
                                        <td align="center" bgcolor="#2563eb" style="border-radius: 8px;">
                                            <a href="${fullLink.trim()}" target="_blank" style="font-size: 16px; color: #ffffff; text-decoration: none; border-radius: 8px; padding: 14px 32px; border: 1px solid #2563eb; display: inline-block; font-weight: 600;">
                                                ${this.i18n.t('auth.messages.mail.common.view_details', { lang })}
                                            </a>
                                        </td>
                                    </tr>
                                </table>

                                <div style="font-size: 12px; color: #93c5fd; margin-top: 40px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                                    <p>${this.i18n.t('auth.messages.mail.common.received_due_to_settings', { lang })}</p>
                                    <p>${this.i18n.t('auth.messages.mail.common.need_help_contact_support', { lang, args: { email: supportEmail.trim() } })}</p>
                                    <p>&copy; ${new Date().getFullYear()} ${siteName}.</p>
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
            to: to.trim(),
            subject: this.i18n.t('auth.messages.mail.new_message.subject', { lang, args: { senderName: senderName.trim() } }),
            html: htmlContent,
            // attachments: settings.siteLogo ? [{
            //     filename: 'logo.png',
            //     path: path.join(process.cwd(), settings.siteLogo.replace(/^\/+/, '')),
            //     cid: 'logo'
            // }] : []
        });
    }
}


