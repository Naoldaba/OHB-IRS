import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import {
  StorageProvider,
  StorageSaveInput,
  StorageSaveResult,
} from './storage.provider';

/**
 * Development/self-hosted storage: writes objects under a local directory and
 * serves them as static files (see `useStaticAssets` in `main.ts`). The public
 * URL is `<ASSET_PUBLIC_BASE_URL>/<PREFIX>/<folder>/<uuid>.<ext>`.
 *
 * Production deployments should prefer a cloud provider implementing
 * {@link StorageProvider}; local disk is not durable across instances.
 */
export class LocalDiskStorage extends StorageProvider {
  private readonly logger = new Logger(LocalDiskStorage.name);

  constructor(
    /** Absolute filesystem directory the static server also exposes. */
    private readonly rootDir: string,
    /** Public base URL the files are reachable at, e.g. `http://localhost:4000`. */
    private readonly publicBaseUrl: string,
    /** URL path prefix the static server mounts the root dir under, e.g. `/uploads`. */
    private readonly urlPrefix: string,
  ) {
    super();
  }

  async save(input: StorageSaveInput): Promise<StorageSaveResult> {
    const fileName = `${randomUUID()}.${input.ext}`;
    const dir = join(this.rootDir, input.folder);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, fileName), input.buffer);
    const url = this.joinUrl(this.urlPrefix, input.folder, fileName);
    return { url };
  }

  async remove(url: string): Promise<void> {
    const prefix = this.joinUrl(this.urlPrefix) + '/';
    const idx = url.indexOf(prefix);
    // Not one of ours (e.g. a cloud URL left over from another backend) — skip.
    if (idx === -1) return;
    const relative = url.slice(idx + prefix.length);
    // Guard against path traversal from a malformed/hostile stored value.
    if (relative.includes('..')) return;
    try {
      await unlink(join(this.rootDir, relative));
    } catch (err) {
      // Missing file or race — cleanup is best-effort, never fatal.
      this.logger.warn(`Could not remove stored avatar ${relative}: ${String(err)}`);
    }
  }

  /** Joins base + path segments into a normalized URL with single slashes. */
  private joinUrl(...segments: string[]): string {
    const parts = [this.publicBaseUrl, ...segments].map((s, i) =>
      i === 0 ? s.replace(/\/+$/, '') : s.replace(/^\/+|\/+$/g, ''),
    );
    return parts.filter(Boolean).join('/');
  }
}
