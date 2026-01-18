import { Inject, Injectable } from '@nestjs/common';
import { SettingsService } from 'src/settings/settings.service';
import * as nodemailer from 'nodemailer';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { Setting } from 'entities/global.entity';
import * as path from 'path';

@Injectable()
export class MailService {
    private transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    constructor(
        private readonly settingsService: SettingsService,
        @Inject(CACHE_MANAGER) private cacheManager: Cache) { }

    private buildFrom(settings?: Setting): string {
        const siteName = settings?.siteName ?? process.env.PROJECT_NAME ?? 'No-Reply';
        const contact =
            settings?.contactEmail ??
            process.env.EMAIL_USER ??
            process.env.EMAIL_FROM ??
            '';

        if (contact) {
            return `"${siteName}" <${contact}>`;
        }
        return `${siteName} <no-reply@localhost>`;
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

        const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          margin: 0;
          padding: 0;
          background-color: #f4f7fb;
          color: #333;
        }
        .email-container {
          width: 100%;
          max-width: 600px;
          margin: auto;
          padding: 20px;
          background-color: #ffffff;
          border-radius: 8px;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }
        .content {
          text-align: center;
          padding: 20px;
          line-height: 1.6;
        }
        h2 {
          font-size: 24px;
          font-weight: 600;
          color: #333;
          margin-bottom: 10px;
        }
        p {
          font-size: 14px;
          color: #555;
          margin: 10px 0;
        }
        .otp-code {
          display: inline-block;
          margin: 20px auto;
          padding: 15px 30px;
          font-size: 32px;
          font-weight: 700;
          color: #ffffff;
          background-color: #007BFF;
          border-radius: 8px;
          border: none;
        }
        .otp-code:hover {
          background-color: #0056b3;
        }
        .copy-button {
          display: inline-block;
          margin-top: 20px;
          padding: 12px 25px;
          color: #ffffff;
          background-color: #28a745;
          font-size: 16px;
          border-radius: 8px;
          border: none;
          text-decoration: none;
          cursor: pointer;
        }
        .copy-button:hover {
          background-color: #218838;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          font-size: 12px;
          color: #aaa;
        }
        .footer a {
          color: #007BFF;
          text-decoration: none;
        }
        @media (max-width: 600px) {
          .email-container {
            padding: 15px;
          }
          h2 {
            font-size: 20px;
          }
          .otp-code {
            font-size: 28px;
          }
        }
      </style>
    </head>
    <body>
    <div class="email-container">
        ${this.getSiteLogo(settings) || ''}
        <div class="content">
          <h2>Your OTP Code</h2>
          <p>We received a request to ${actionType}. Use the OTP code below to proceed:</p>
          <div class="otp-code">${otp}</div>
          <p>This OTP code is valid for 5 minutes.</p>
          <p>If you did not request this, please ignore this email.</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Your Project Name. All rights reserved.</p>
          <p><a href="https://yourproject.com/privacy-policy">Privacy Policy</a></p>
        </div>
      </div>
    </body>
    </html>
        `;

        await this.transporter.sendMail({
            from: this.buildFrom(settings),
            to,
            subject: actionType,
            html: htmlContent,
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

    async sendVerificationEmail(email: string, code: string, username: string) {
        if (!email) return;
        const settings = await this.getSettings();
        const subject = 'Verify Your Email Address';

        const html = `
    <html>
        <head>
            <style>
                body {
                    font-family: 'Arial', sans-serif;
                    color: #333;
                    background-color: #f5f5f5;
                    margin: 0;
                    padding: 0;
                    -webkit-font-smoothing: antialiased;
                    -moz-osx-font-smoothing: grayscale;
                }
                .container {
                    width: 100%;
                    padding: 40px 20px;
                    text-align: center;
                }
                .email-content {
                    background-color: #ffffff;
                    padding: 30px;
                    border-radius: 8px;
                    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                    max-width: 600px;
                    margin: auto;
                }
                .email-header {
                    font-size: 28px;
                    color: #4CAF50;
                    margin-bottom: 20px;
                    font-weight: bold;
                }
                .email-body {
                    font-size: 16px;
                    line-height: 1.5;
                    color: #555;
                    margin-bottom: 20px;
                }
                .verification-code {
                    font-size: 24px;
                    font-weight: bold;
                    color: #333;
                    background-color: #f0f0f0;
                    padding: 10px 20px;
                    border-radius: 5px;
                    display: inline-block;
                    margin: 10px 0;
                }
                .button {
                    background-color: #4CAF50;
                    color: #fff;
                    padding: 12px 25px;
                    border-radius: 50px;
                    text-decoration: none;
                    font-size: 18px;
                    font-weight: bold;
                    display: inline-block;
                    margin-top: 20px;
                    transition: background-color 0.3s ease;
                }
                .button:hover {
                    background-color: #45a049;
                }
                .footer {
                    font-size: 12px;
                    color: #777;
                    margin-top: 30px;
                    text-align: center;
                }
                .footer a {
                    color: #4CAF50;
                    text-decoration: none;
                }
                /* Responsive Design */
                @media (max-width: 600px) {
                    .email-content {
                        padding: 20px;
                    }
                    .email-header {
                        font-size: 24px;
                    }
                    .email-body {
                        font-size: 14px;
                    }
                    .button {
                        padding: 10px 20px;
                        font-size: 16px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="email-content">
                    ${this.getSiteLogo(settings) || ''}
                    <div class="email-header">
                        Welcome, ${username}!
                    </div>
                    <div class="email-body">
                        <p>Thank you for registering with us! To complete your registration, please verify your email address by entering the verification code below:</p>
                        <p class="verification-code">${code}</p>
                    </div>
                </div>
            </div>
        </body>
    </html>
  `;

        await this.transporter.sendMail({
            from: this.buildFrom(settings),
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

    async sendPasswordResetOtp(email: string, username: string, otp: string) {
        if (!email) return;
        const subject = 'Password Reset OTP';
        const settings = await this.getSettings();
        // fetch support email from settings (cache) with env fallback
        const supportEmail = await (async () => {
            try {

                return settings?.contactEmail ?? process.env.SUPPORT_EMAIL ?? process.env.EMAIL_FROM ?? 'support@example.com';
            } catch (err) {
                return process.env.SUPPORT_EMAIL ?? process.env.EMAIL_FROM ?? 'support@example.com';
            }
        })();

        const html = `
  <html>
      <head>
          <style>
              body {
                  font-family: 'Arial', sans-serif;
                  color: #333;
                  background-color: #f5f5f5;
                  margin: 0;
                  padding: 0;
                  -webkit-font-smoothing: antialiased;
                  -moz-osx-font-smoothing: grayscale;
              }
              .container {
                  width: 100%;
                  padding: 40px 20px;
                  text-align: center;
              }
              .email-content {
                  background-color: #ffffff;
                  padding: 30px;
                  border-radius: 8px;
                  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                  max-width: 600px;
                  margin: auto;
              }
              .email-header {
                  font-size: 28px;
                  color: #4CAF50;
                  margin-bottom: 20px;
                  font-weight: bold;
              }
              .email-body {
                  font-size: 16px;
                  line-height: 1.5;
                  color: #555;
                  margin-bottom: 20px;
              }
              .otp-code {
                  font-size: 24px;
                  font-weight: bold;
                  color: #333;
                  background-color: #f0f0f0;
                  padding: 10px 20px;
                  border-radius: 4px;
                  margin-top: 20px;
              }
              .footer {
                  font-size: 12px;
                  color: #777;
                  margin-top: 30px;
                  text-align: center;
              }
              .footer a {
                  color: #4CAF50;
                  text-decoration: none;
              }
              /* Responsive Design */
              @media (max-width: 600px) {
                  .email-content {
                      padding: 20px;
                  }
                  .email-header {
                      font-size: 24px;
                  }
                  .email-body {
                      font-size: 14px;
                  }
                  .otp-code {
                      font-size: 20px;
                  }
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="email-content">
                ${this.getSiteLogo(settings) || ''}
                  <div class="email-header">
                      Hello ${username},
                  </div>
                  <div class="email-body">
                      <p>We received a request to reset your password. If you did not make this request, please ignore this email.</p>
                      <p>Your OTP for resetting your password is:</p>
                      <div class="otp-code">${otp}</div>
                      <p>This OTP is valid for 10 minutes. Please use it to reset your password within that time.</p>
                  </div>
                  <div class="footer">
                      <p>If you have any questions or need help, contact our support team <a href="mailto:${supportEmail}">here</a>.</p>
                  </div>
              </div>
          </div>
      </body>
  </html>
  `;

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

    async sendPasswordChangeNotification(userEmail: string, username: string, adminEmail: string) {
        if (!userEmail) return;
        const settings = await this.getSettings();
        const subject = 'Password Changed Successfully';

        const html = `
  <html>
      <head>
          <style>
              body {
                  font-family: 'Arial', sans-serif;
                  color: #333;
                  background-color: #f5f5f5;
                  margin: 0;
                  padding: 0;
                  -webkit-font-smoothing: antialiased;
                  -moz-osx-font-smoothing: grayscale;
              }
              .container {
                  width: 100%;
                  padding: 40px 20px;
                  text-align: center;
              }
              .email-content {
                  background-color: #ffffff;
                  padding: 30px;
                  border-radius: 8px;
                  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                  max-width: 600px;
                  margin: auto;
              }
              .email-header {
                  font-size: 28px;
                  color: #4CAF50;
                  margin-bottom: 20px;
                  font-weight: bold;
              }
              .email-body {
                  font-size: 16px;
                  line-height: 1.5;
                  color: #555;
                  margin-bottom: 20px;
              }
              .footer {
                  font-size: 12px;
                  color: #777;
                  margin-top: 30px;
                  text-align: center;
              }
              .footer a {
                  color: #4CAF50;
                  text-decoration: none;
              }
              @media (max-width: 600px) {
                  .email-content {
                      padding: 20px;
                  }
                  .email-header {
                      font-size: 24px;
                  }
                  .email-body {
                      font-size: 14px;
                  }
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="email-content">
              ${this.getSiteLogo(settings) || ''}
                  <div class="email-header">
                      Hello ${username},
                  </div>
                  <div class="email-body">
                      <p>Your account password has been successfully changed.</p>
                      <p>If you did not perform this change, please contact our support team immediately.</p>
                  </div>
                  <div class="footer">
                      <p>Contact Admin: <a href="mailto:${adminEmail}">${adminEmail}</a></p>
                  </div>
              </div>
          </div>
      </body>
  </html>
  `;

        await this.transporter.sendMail({
            from: await this.buildFrom(settings),
            to: userEmail,
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

    async sendEmailChangeNotification(userEmail: string, username: string, adminEmail: string) {
        if (!userEmail) return;
        const settings = await this.getSettings();
        const subject = 'Email Address Updated Successfully';

        const html = `
  <html>
      <head>
          <style>
              body {
                  font-family: 'Arial', sans-serif;
                  color: #333;
                  background-color: #f5f5f5;
                  margin: 0;
                  padding: 0;
                  -webkit-font-smoothing: antialiased;
                  -moz-osx-font-smoothing: grayscale;
              }
              .container {
                  width: 100%;
                  padding: 40px 20px;
                  text-align: center;
              }
              .email-content {
                  background-color: #ffffff;
                  padding: 30px;
                  border-radius: 8px;
                  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                  max-width: 600px;
                  margin: auto;
              }
              .email-header {
                  font-size: 28px;
                  color: #4CAF50;
                  margin-bottom: 20px;
                  font-weight: bold;
              }
              .email-body {
                  font-size: 16px;
                  line-height: 1.5;
                  color: #555;
                  margin-bottom: 20px;
              }
              .footer {
                  font-size: 12px;
                  color: #777;
                  margin-top: 30px;
                  text-align: center;
              }
              .footer a {
                  color: #4CAF50;
                  text-decoration: none;
              }
              @media (max-width: 600px) {
                  .email-content {
                      padding: 20px;
                  }
                  .email-header {
                      font-size: 24px;
                  }
                  .email-body {
                      font-size: 14px;
                  }
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="email-content">
              ${this.getSiteLogo(settings) || ''}
                  <div class="email-header">
                      Hello ${username},
                  </div>
                  <div class="email-body">
                      <p>Your account email address has been successfully updated.</p>
                      <p>If you did not request this change, please contact our support team immediately to secure your account.</p>
                  </div>
                  <div class="footer">
                      <p>Contact Admin: <a href="mailto:${adminEmail}">${adminEmail}</a></p>
                  </div>
              </div>
          </div>
      </body>
  </html>
  `;

        await this.transporter.sendMail({
            from: await this.buildFrom(settings),
            to: userEmail,
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

    async sendEmailChangeConfirmation(email: string, username: string, userId: string, code: string) {
        if (!email) return;
        const subject = 'Confirm Your New Email Address';
        const settings = await this.getSettings();
        const confirmLink = `${process.env.BACKEND_URL}/api/v1/auth/confirm-email-change?userId=${userId}&pendingEmail=${encodeURIComponent(email)}&code=${code}`;

        const html = `
  <html>
      <head>
          <style>
              body {
                  font-family: 'Arial', sans-serif;
                  color: #333;
                  background-color: #f5f5f5;
                  margin: 0;
                  padding: 0;
                  -webkit-font-smoothing: antialiased;
                  -moz-osx-font-smoothing: grayscale;
              }
              .container {
                  width: 100%;
                  padding: 40px 20px;
                  text-align: center;
              }
              .email-content {
                  background-color: #ffffff;
                  padding: 30px;
                  border-radius: 8px;
                  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                  max-width: 600px;
                  margin: auto;
              }
              .email-header {
                  font-size: 28px;
                  color: #4CAF50;
                  margin-bottom: 20px;
                  font-weight: bold;
              }
              .email-body {
                  font-size: 16px;
                  line-height: 1.5;
                  color: #555;
                  margin-bottom: 20px;
              }
              .confirm-btn {
                  display: inline-block;
                  background-color: #4CAF50;
                  color: white;
                  padding: 10px 20px;
                  border-radius: 4px;
                  text-decoration: none;
                  font-weight: bold;
                  margin-top: 20px;
              }
              .footer {
                  font-size: 12px;
                  color: #777;
                  margin-top: 30px;
                  text-align: center;
              }
              .footer a {
                  color: #4CAF50;
                  text-decoration: none;
              }
              @media (max-width: 600px) {
                  .email-content {
                      padding: 20px;
                  }
                  .email-header {
                      font-size: 24px;
                  }
                  .email-body {
                      font-size: 14px;
                  }
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="email-content">
              ${this.getSiteLogo(settings) || ''}
                  <div class="email-header">
                      Hello ${username},
                  </div>
                  <div class="email-body">
                      <p>You requested to change your email address.</p>
                      <p>Click the button below to confirm your new email:</p>
                      <p><a href="${confirmLink}" class="confirm-btn">Confirm Email</a></p>
                      <p>If you did not request this change, please ignore this email.</p>
                  </div>
              </div>
          </div>
      </body>
  </html>
  `;

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

    async sendInviteEmail(opts: {
        to: string;
        subject: string;
        senderName: string;
        message: string;
    }) {

        if (!opts.to) return;
        const settings = await this.getSettings();
        const htmlContent = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background-color: #f4f7fb;
        margin: 0;
        padding: 0;
        color: #333;
      }
      .email-container {
        width: 100%;
        max-width: 620px;
        margin: auto;
        background: #fff;
        padding: 25px;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      }
      h2 {
        color: #444;
        font-size: 22px;
        margin-bottom: 10px;
      }
      p {
        line-height: 1.6;
        color: #555;
        font-size: 15px;
      }
      .message-box {
        background: #f0f7ff;
        padding: 15px;
        border-left: 4px solid #007bff;
        margin: 20px 0;
        border-radius: 6px;
      }
      .footer {
        margin-top: 30px;
        font-size: 12px;
        color: #888;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="email-container">
    ${this.getSiteLogo(settings) || ''}
      <h2>You Have Been Invited!</h2>

      <p><strong>${opts.senderName}</strong> has invited you to join our platform.</p>

      <div class="message-box">
        ${opts.message}
      </div>

      <p>
        If you wish to join, simply click the link included above inside the invitation message.
      </p>

      <div class="footer">
        © ${new Date().getFullYear()} ${process.env.PROJECT_NAME}. All rights reserved.
      </div>

    </div>
  </body>
  </html>
  `;

        await this.transporter.sendMail({
            from: await this.buildFrom(settings),
            to: opts.to,
            subject: opts.subject,
            html: htmlContent,
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

    async sendWelcomeEmail(
        email: string,
        username: string,
        role: string
    ) {
        if (!email) return;
        const settings = await this.getSettings();
        const isSeller = role === 'seller';

        const subject = isSeller
            ? 'Welcome to Our Freelancing Platform – Start Selling Today!'
            : 'Welcome to Our Freelancing Platform – Find the Perfect Freelancer';

        const mainTitle = isSeller
            ? `Welcome aboard, ${username}!`
            : `Welcome, ${username}!`;

        const roleMessage = isSeller
            ? `
      <p>You’re now part of our growing community of talented sellers.</p>
      <p>Create your services, showcase your skills, and start earning by working with clients from all over the world.</p>
      <ul style="text-align:left; max-width:420px; margin:20px auto; color:#555;">
        <li>✔ Create and publish your services</li>
        <li>✔ Receive job requests from customers</li>
        <li>✔ Get paid securely for your work</li>
      </ul>
    `
            : `
      <p>You’re all set to find skilled professionals for your projects.</p>
      <p>Post jobs, explore top services, and collaborate with trusted freelancers easily.</p>
      <ul style="text-align:left; max-width:420px; margin:20px auto; color:#555;">
        <li>✔ Explore professional services</li>
        <li>✔ Post job requirements</li>
        <li>✔ Chat directly with sellers</li>
      </ul>
    `;

        const ctaText = isSeller ? 'Create Your First Service' : 'Explore Services';
        const ctaLink = isSeller
            ? `${process.env.FRONTEND_URL}/create-gig`
            : `${process.env.FRONTEND_URL}/services`;

        const html = `
  <html>
    <head>
      <style>
        body {
          font-family: 'Arial', sans-serif;
          background-color: #f5f7fb;
          margin: 0;
          padding: 0;
          color: #333;
        }
        .container {
          width: 100%;
          padding: 40px 20px;
          text-align: center;
        }
        .email-content {
          background-color: #ffffff;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          max-width: 600px;
          margin: auto;
        }
        .logo {
          margin-bottom: 25px;
        }
        .logo img {
          max-width: 160px;
        }
        .email-header {
          font-size: 26px;
          font-weight: bold;
          color: #2e7d32;
          margin-bottom: 15px;
        }
        .email-body {
          font-size: 15px;
          line-height: 1.6;
          color: #555;
        }
        .cta-button {
          display: inline-block;
          margin-top: 25px;
          padding: 12px 30px;
          background-color: #2e7d32;
          color: #fff;
          text-decoration: none;
          border-radius: 30px;
          font-size: 16px;
          font-weight: bold;
        }
        .cta-button:hover {
          background-color: #256628;
        }
        .footer {
          margin-top: 30px;
          font-size: 12px;
          color: #888;
        }
        @media (max-width: 600px) {
          .email-content {
            padding: 20px;
          }
          .email-header {
            font-size: 22px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="email-content">
        ${this.getSiteLogo(settings) || ''}
          <div class="email-header">
            ${mainTitle}
          </div>

          <div class="email-body">
            ${roleMessage}

            <a href="${ctaLink}" class="cta-button">
              ${ctaText}
            </a>

            <p style="margin-top:25px;">
              If you have any questions, our support team is always here to help.
            </p>
          </div>

          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Your Project Name. All rights reserved.</p>
          </div>
        </div>
      </div>
    </body>
  </html>
  `;

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

    async sendSellerFeePolicyEmail(email: string, username: string) {
        if (!email) return;

        const settings = await this.getSettings();
        // Get the percent from settings, or default to 10
        const feePercent = settings?.sellerServiceFee ?? 10;
        const siteName = settings?.siteName ?? 'Our Platform';

        const subject = `Important: Understanding our Seller Fee Structure at ${siteName}`;

        const html = `
    <html>
        <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; background-color: #f5f7fb; padding: 20px;">
        ${this.getSiteLogo(settings) || ''}
            <div style="max-width: 600px; margin: auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                <h2 style="color: #2e7d32; text-align: center;">Transparent Pricing for Sellers</h2>
                <p>Hello ${username},</p>
                <p>Welcome to the community! To help you manage your business effectively, we want to provide clear information on how payments and fees work on <strong>${siteName}</strong>.</p>
                
                <div style="background-color: #e8f5e9; padding: 20px; border-left: 5px solid #2e7d32; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #2e7d32;">Our Standard Service Fee: ${feePercent}%</h3>
                    <p style="margin-bottom: 0;">For every order you complete, a service fee of <strong>${feePercent}%</strong> is deducted from the total order amount.</p>
                </div>

                <div style="text-align: center; margin-top: 30px;">
                    <p><em>Example: If you sell a service for 
                    <span className="flex gap-1">
                        <svg style="fill: #333" className="object-contain" width="16" height="16" viewBox="0 0 160 180"
                            fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M93.6632 26.3338C100.414 18.7553 104.563 15.3529 112.713 11.0513V137.247L93.6632 141.184V26.3338Z" />
                            <path
                                d="M154.529 89.7792C158.478 81.4433 158.943 77.7385 160 69.187L13.9804 100.894C10.5177 108.607 9.40314 112.918 8.86952 120.576L154.529 89.7792Z" />
                            <path
                                d="M154.529 128.433C158.478 120.097 158.943 116.392 160 107.84L94.3601 121.733C93.8955 129.375 94.4291 133.295 93.8955 140.952L154.529 128.433Z" />
                            <path
                                d="M154.529 167.08C158.478 158.744 158.943 155.04 160 146.488L100.168 159.477C97.1479 163.645 95.2894 170.591 93.8955 179.6L154.529 167.08Z" />
                            <path
                                d="M59.5134 153.919C65.3212 146.741 71.3613 137.711 75.5429 130.301L5.11078 145.567C1.64809 153.28 0.533496 157.592 -0.00012207 165.249L59.5134 153.919Z" />
                        </svg>
                        100
                    </span>
                    , you will receive 
                     <span className="flex gap-1">
                        <svg style="fill: #333" className="object-contain" width="16" height="16" viewBox="0 0 160 180"
                            fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M93.6632 26.3338C100.414 18.7553 104.563 15.3529 112.713 11.0513V137.247L93.6632 141.184V26.3338Z" />
                            <path
                                d="M154.529 89.7792C158.478 81.4433 158.943 77.7385 160 69.187L13.9804 100.894C10.5177 108.607 9.40314 112.918 8.86952 120.576L154.529 89.7792Z" />
                            <path
                                d="M154.529 128.433C158.478 120.097 158.943 116.392 160 107.84L94.3601 121.733C93.8955 129.375 94.4291 133.295 93.8955 140.952L154.529 128.433Z" />
                            <path
                                d="M154.529 167.08C158.478 158.744 158.943 155.04 160 146.488L100.168 159.477C97.1479 163.645 95.2894 170.591 93.8955 179.6L154.529 167.08Z" />
                            <path
                                d="M59.5134 153.919C65.3212 146.741 71.3613 137.711 75.5429 130.301L5.11078 145.567C1.64809 153.28 0.533496 157.592 -0.00012207 165.249L59.5134 153.919Z" />
                        </svg>
                        ${100 - (100 * (feePercent / 100))}
                    </span>
                     after the 
                       <span className="flex gap-1">
                        <svg style="fill: #333" className="object-contain" width="16" height="16" viewBox="0 0 160 180"
                            fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M93.6632 26.3338C100.414 18.7553 104.563 15.3529 112.713 11.0513V137.247L93.6632 141.184V26.3338Z" />
                            <path
                                d="M154.529 89.7792C158.478 81.4433 158.943 77.7385 160 69.187L13.9804 100.894C10.5177 108.607 9.40314 112.918 8.86952 120.576L154.529 89.7792Z" />
                            <path
                                d="M154.529 128.433C158.478 120.097 158.943 116.392 160 107.84L94.3601 121.733C93.8955 129.375 94.4291 133.295 93.8955 140.952L154.529 128.433Z" />
                            <path
                                d="M154.529 167.08C158.478 158.744 158.943 155.04 160 146.488L100.168 159.477C97.1479 163.645 95.2894 170.591 93.8955 179.6L154.529 167.08Z" />
                            <path
                                d="M59.5134 153.919C65.3212 146.741 71.3613 137.711 75.5429 130.301L5.11078 145.567C1.64809 153.28 0.533496 157.592 -0.00012207 165.249L59.5134 153.919Z" />
                        </svg>
                        ${100 * (feePercent / 100)}
                    </span>
                      platform fee.</em></p>
                    <a href="${process.env.FRONTEND_URL}/create-gig" 
                       style="display: inline-block; margin-top: 15px; padding: 12px 25px; background-color: #2e7d32; color: #fff; text-decoration: none; border-radius: 30px; font-weight: bold;">
                       Start Listing Your Services
                    </a>
                </div>
                
                <p style="font-size: 12px; color: #888; margin-top: 40px; text-align: center; border-top: 1px solid #eee; padding-top: 20px;">
                    &copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.
                </p>
            </div>
        </body>
    </html>
    `;

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

}


