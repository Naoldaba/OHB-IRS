/** The authenticated principal attached to each request after the session guard. */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string; // RoleName value
  laboratoryId: string | null;
  /** Public URL of the user's profile picture, or null when none is set. */
  avatarUrl: string | null;
  /** When true, the user must change their password before doing anything else. */
  mustChangePassword: boolean;
}
