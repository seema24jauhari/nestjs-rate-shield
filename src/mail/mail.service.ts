/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendResetEmail(email: string, token: string) {
    const link = `${this.configService.get<string>('FRONTEND_URL')}/reset-password?token=${token}`;
    const info: SMTPTransport.SentMessageInfo = await this.transporter.sendMail(
      {
        from: this.configService.get<string>('SMTP_USER'),
        to: email,
        subject: 'Reset your password',
        html: `<p>Click <a href="${link}">here</a> to reset your password. Expires in 1 hour.</p>`,
      },
    );

    const { accepted, rejected } = info;
    if (rejected.length > 0) {
      throw new Error(`Email rejected for: ${rejected.map(String).join(', ')}`);
    }

    console.log('Email sent to:', accepted);
  }

  async sendOtpEmail(email: string, code: string) {
    const info: SMTPTransport.SentMessageInfo = await this.transporter.sendMail(
      {
        from: this.configService.get<string>('SMTP_USER'),
        to: email,
        subject: 'Verification Code',
        html: `<p>Your verification code is: ${code}</p>`,
      },
    );

    const { accepted, rejected } = info;
    if (rejected.length > 0) {
      throw new Error(`Email rejected for: ${rejected.map(String).join(', ')}`);
    }

    console.log('Email sent to:', accepted);
  }
}
