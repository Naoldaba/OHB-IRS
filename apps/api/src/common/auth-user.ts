/** The authenticated principal attached to each request after the session guard. */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string; // RoleName value
  laboratoryId: string | null;
}
