/**
 * Resolved mail settings, read once from the environment. When SMTP is not
 * configured the mailer runs in a "log" transport that prints the message (and
 * any action link) to the API console instead of sending it — so flows like
 * password reset work end-to-end in local development without an SMTP account.
 */
export interface MailConfig {
  /** `smtp` when host is configured, otherwise `log` (dev fallback). */
  transport: 'smtp' | 'log';
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    pass?: string;
  } | null;
  /** From header, e.g. `"OHB Reporting" <no-reply@ohb.local>`. */
  from: string;
  /**
   * Public base URL of the web app, used to build links in emails (no trailing
   * slash). Falls back to the first configured CORS origin, then localhost.
   */
  webBaseUrl: string;
}

export function loadMailConfig(): MailConfig {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim() || undefined;
  const pass = process.env.SMTP_PASS?.trim() || undefined;
  const port = Number(process.env.SMTP_PORT ?? 587);
  // Port 465 is implicit TLS; otherwise STARTTLS is negotiated on a plain port.
  const secure = (process.env.SMTP_SECURE ?? (port === 465 ? 'true' : 'false')) === 'true';

  const from =
    process.env.MAIL_FROM?.trim() || '"OHB Reporting System" <no-reply@ohb.local>';

  const webBaseUrl = (
    process.env.WEB_BASE_URL ??
    process.env.WEB_ORIGIN?.split(',')[0] ??
    'http://localhost:3000'
  ).replace(/\/+$/, '');

  return {
    transport: host ? 'smtp' : 'log',
    smtp: host ? { host, port, secure, user, pass } : null,
    from,
    webBaseUrl,
  };
}
