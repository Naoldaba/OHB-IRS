import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    /** Set between a correct password and a verified second factor (2FA login). */
    pendingTwoFactorUserId?: string;
    /** Epoch ms when the pending 2FA stage began; used to expire a stale challenge. */
    pendingTwoFactorAt?: number;
  }
}
