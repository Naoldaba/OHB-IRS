/**
 * Storage abstraction for user-uploaded binary assets (currently profile
 * pictures). The database stores only a public URL; how that URL is produced and
 * how the underlying object is deleted is the provider's concern.
 *
 * Swapping local-disk storage for a cloud bucket (S3, Cloudinary, …) in
 * production is a matter of adding a provider that implements this contract and
 * selecting it via `STORAGE_DRIVER` — no caller changes.
 */

export interface StorageSaveInput {
  /** Raw file bytes. */
  buffer: Buffer;
  /** MIME type as reported by the upload (already validated by the caller). */
  mimeType: string;
  /** File extension to use, without the dot (e.g. `jpg`, `png`, `webp`). */
  ext: string;
  /**
   * A logical folder for the object (e.g. `avatars`). Providers map this onto a
   * path prefix / key prefix as appropriate.
   */
  folder: string;
}

export interface StorageSaveResult {
  /** The public URL to persist and return to clients. */
  url: string;
}

/** Contract every storage backend implements. Injected via the `STORAGE` token. */
export abstract class StorageProvider {
  /** Persists the bytes and returns the public URL to store in the database. */
  abstract save(input: StorageSaveInput): Promise<StorageSaveResult>;

  /**
   * Best-effort deletion of a previously saved object, given the public URL that
   * was stored. Must not throw when the object belongs to another backend or no
   * longer exists — callers treat cleanup as non-critical.
   */
  abstract remove(url: string): Promise<void>;
}

/** DI token for the configured {@link StorageProvider}. */
export const STORAGE = 'STORAGE_PROVIDER';
