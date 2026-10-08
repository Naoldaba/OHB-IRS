import { isAbsolute, join } from 'path';

/**
 * Resolved storage settings, read once from the environment. Shared by the
 * storage module (which builds the provider) and `main.ts` (which mounts the
 * local static server), so both agree on the directory and URL prefix.
 */
export interface StorageConfig {
  /** `local` (default) or a cloud driver name (added later). */
  driver: string;
  /** Absolute directory local objects live in. */
  localRootDir: string;
  /** URL path prefix the local root is served under (no trailing slash). */
  urlPrefix: string;
  /** Public base URL files are reachable at (no trailing slash). */
  publicBaseUrl: string;
}

export function loadStorageConfig(): StorageConfig {
  const driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();

  const configuredDir = process.env.LOCAL_STORAGE_DIR ?? 'uploads';
  const localRootDir = isAbsolute(configuredDir)
    ? configuredDir
    : join(process.cwd(), configuredDir);

  const urlPrefix = '/' + (process.env.ASSET_URL_PREFIX ?? 'uploads').replace(/^\/+|\/+$/g, '');

  const port = Number(process.env.API_PORT ?? 4000);
  const publicBaseUrl = (
    process.env.ASSET_PUBLIC_BASE_URL ?? `http://localhost:${port}`
  ).replace(/\/+$/, '');

  return { driver, localRootDir, urlPrefix, publicBaseUrl };
}
