import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { loadMailConfig, type MailConfig } from './mail.config';

interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Outbound email. Uses SMTP when configured (`SMTP_HOST`), otherwise falls back
 * to a "log" transport that writes the message to the API console so flows work
 * in local development without a mail account. Sending is best-effort from the
 * caller's perspective — callers that must not leak information (e.g. password
 * reset) should not vary their response based on whether a send succeeded.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private readonly config: MailConfig = loadMailConfig();
  private transporter: Transporter | null = null;

  get webBaseUrl(): string {
    return this.config.webBaseUrl;
  }

  onModuleInit() {
    if (this.config.transport === 'smtp' && this.config.smtp) {
      const { host, port, secure, user, pass } = this.config.smtp;
      this.transporter = createTransport({
        host,
        port,
        secure,
        auth: user ? { user, pass } : undefined,
      });
      this.logger.log(`Mail transport: SMTP ${host}:${port}`);
    } else {
      this.logger.warn(
        'Mail transport: LOG (SMTP_HOST not set). Emails will be printed to the console, not sent.',
      );
    }
  }

  async send(mail: Mail): Promise<void> {
    if (!this.transporter) {
      this.logger.log(
        `\n──────── EMAIL (not sent — log transport) ────────\n` +
          `To:      ${mail.to}\n` +
          `Subject: ${mail.subject}\n\n` +
          `${mail.text}\n` +
          `──────────────────────────────────────────────────`,
      );
      return;
    }
    await this.transporter.sendMail({
      from: this.config.from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
  }

  /**
   * A notification email mirroring an in-app notice (Phase 19). Best-effort: the
   * caller treats a send failure as non-fatal. `link` is an absolute URL to the
   * related submission or dashboard when one applies.
   */
  async sendNotification(to: string, title: string, body: string, link?: string): Promise<void> {
    const text =
      `${body}\n\n` +
      (link ? `Open it here:\n${link}\n\n` : '') +
      `— OHB Integrated Report System\n` +
      `You are receiving this because email notifications are on for your account. ` +
      `You can turn them off under your profile.`;
    const html =
      `<p>${escapeHtml(body)}</p>` +
      (link ? `<p><a href="${escapeHtml(link)}">Open it in the reporting system</a></p>` : '') +
      `<hr/><p style="color:#64748b;font-size:12px">OHB Integrated Report System — ` +
      `you are receiving this because email notifications are on for your account. ` +
      `You can turn them off under your profile.</p>`;
    await this.send({ to, subject: `${title} · OHB Reporting`, text, html });
  }

  /** Password-reset email containing a time-limited link to the reset page. */
  async sendPasswordReset(to: string, link: string, expiresInMinutes: number): Promise<void> {
    const subject = 'Reset your OHB Reporting System password';
    const text =
      `We received a request to reset the password for your OHB Reporting System account.\n\n` +
      `Open this link to choose a new password:\n${link}\n\n` +
      `This link expires in ${expiresInMinutes} minutes and can be used once.\n` +
      `If you did not request this, you can ignore this email — your password will not change.`;
    const html =
      `<p>We received a request to reset the password for your OHB Reporting System account.</p>` +
      `<p><a href="${escapeHtml(link)}">Choose a new password</a></p>` +
      `<p>This link expires in ${expiresInMinutes} minutes and can be used once. ` +
      `If you did not request this, you can ignore this email — your password will not change.</p>`;
    await this.send({ to, subject, text, html });
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
