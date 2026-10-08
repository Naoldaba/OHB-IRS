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

/** The result of saving a private object: an opaque key, not a public URL. */
export interface StorageObjectResult {
  /**
   * Opaque backend key the object is stored under (e.g. `attachments/<uuid>.pdf`
   * for local disk, or an S3 object key). Persisted and passed back to
   * {@link StorageProvider.readObject} / {@link StorageProvider.removeObject}.
   */
  key: string;
}

/** Contract every storage backend implements. Injected via the `STORAGE` token. */
export abstract class StorageProvider {
  /**
   * Persists the bytes as a *public* object and returns the URL to store in the
   * database. Used for assets served directly to the browser (profile pictures).
   */
  abstract save(input: StorageSaveInput): Promise<StorageSaveResult>;

  /**
   * Best-effort deletion of a previously saved public object, given the public
   * URL that was stored. Must not throw when the object belongs to another
   * backend or no longer exists — callers treat cleanup as non-critical.
   */
  abstract remove(url: string): Promise<void>;

  /**
   * Persists the bytes as a *private* object and returns an opaque storage key.
   * Unlike {@link save}, private objects are never served by a public static
   * mount — they are streamed back only through an authorized endpoint (report
   * attachments may contain lab data, so access must be scoped server-side).
   */
  abstract saveObject(input: StorageSaveInput): Promise<StorageObjectResult>;

  /** Reads back a private object's bytes by its stored key. Throws if missing. */
  abstract readObject(key: string): Promise<Buffer>;

  /**
   * Best-effort deletion of a private object by its stored key. Must not throw
   * when the object no longer exists — callers treat cleanup as non-critical.
   */
  abstract removeObject(key: string): Promise<void>;
}

/** DI token for the configured {@link StorageProvider}. */
export const STORAGE = 'STORAGE_PROVIDER';
