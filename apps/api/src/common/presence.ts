/**
 * Online-presence derivation — the single source of truth for "is this user
 * online". Presence is computed server-side and emitted as a boolean; the raw
 * lastSeenAt timestamp is never sent to clients, so a user who has hidden their
 * status leaks nothing (CLAUDE.md: authorization is enforced server-side).
 */

/**
 * How long after a user's last authenticated request they still count as
 * online. Sized at ~2.5× the web client's 45s notification poll so a single
 * missed poll does not flip a present user to offline.
 */
export const ONLINE_WINDOW_MS = 120_000;

/**
 * Minimum age of lastSeenAt before the session guard rewrites it. Keeps the
 * heartbeat to at most one write per user per interval instead of one per
 * request, while staying below the client poll interval so an open tab always
 * refreshes within one window.
 */
export const HEARTBEAT_THROTTLE_MS = 30_000;

/** The presence inputs selected from a user row. */
export interface PresenceInput {
  lastSeenAt: Date | null;
  showOnlineStatus: boolean;
}

/**
 * True when the user both permits their status to be shown and has been seen
 * within the presence window. A hidden status always resolves to offline.
 */
export function isUserOnline(
  user: PresenceInput | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!user || !user.showOnlineStatus || !user.lastSeenAt) return false;
  return now - user.lastSeenAt.getTime() <= ONLINE_WINDOW_MS;
}

/** An author shape as stored, carrying the presence inputs. */
type AuthorWithPresence = {
  id: string;
  fullName: string;
} & PresenceInput;

/** The public author shape: identity plus the derived boolean, no timestamps. */
export interface PublicAuthor {
  id: string;
  fullName: string;
  isOnline: boolean;
}

/**
 * Project a selected author row to its public form, deriving `isOnline` and
 * dropping the raw presence inputs. Returns null for a null author (e.g. a
 * system-authored feedback entry).
 */
export function toPublicAuthor(
  author: AuthorWithPresence | null | undefined,
  now: number = Date.now(),
): PublicAuthor | null {
  if (!author) return null;
  return {
    id: author.id,
    fullName: author.fullName,
    isOnline: isUserOnline(author, now),
  };
}

/** Prisma author select that includes the presence inputs. */
export const AUTHOR_PRESENCE_SELECT = {
  id: true,
  fullName: true,
  lastSeenAt: true,
  showOnlineStatus: true,
} as const;
