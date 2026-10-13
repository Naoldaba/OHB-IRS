/** The authenticated principal attached to each request after the session guard. */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string; // the user's role name (RoleName value for system roles)
  /** The role's data boundary (Phase 28b), a RoleScope value: BUREAU | LAB. */
  scope: string;
  /**
   * Capability keys granted to the user's role (Phase 28), resolved from the DB
   * grant table. This is the authoritative set the PermissionsGuard checks.
   */
  capabilities: string[];
  laboratoryId: string | null;
  /** Public URL of the user's profile picture, or null when none is set. */
  avatarUrl: string | null;
  /** When true, the user must change their password before doing anything else. */
  mustChangePassword: boolean;
  /** When true, the account has TOTP two-step verification enabled. */
  twoFactorEnabled: boolean;
  /** When true, in-app notifications are also delivered to the user by email. */
  emailNotifications: boolean;
  /** When false, the user never appears online to anyone (privacy toggle). */
  showOnlineStatus: boolean;
}
