import { isAbsolute, join, sep } from 'path';

/**
 * The API package root (`apps/api`), resolved from this module's location so it
 * is independent of the process's current working directory. This file compiles
 * to `<api>/dist/storage/storage.config.js` (or runs from `<api>/src/storage`
 * under ts-node); in both cases walking up two levels and dropping a trailing
 * `dist`/`src` segment yields `<api>`. We anchor the default (relative) upload
 * directory here so a file saved by one launch is served by another — otherwise
 * `join(process.cwd(), 'uploads')` points at different folders depending on
 * whether the server was started from the repo root or from `apps/api`.
 */
function apiPackageRoot(): string {
  let dir = join(__dirname, '..'); // <api>/(dist|src)
  const base = dir.split(sep).pop();
  if (base === 'dist' || base === 'src') dir = join(dir, '..'); // -> <api>
  return dir;
}

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

  // A relative LOCAL_STORAGE_DIR (including the default) resolves against the API
  // package root, NOT process.cwd(), so the upload directory is the same folder
  // regardless of where the server was launched from.
  const configuredDir = process.env.LOCAL_STORAGE_DIR ?? 'uploads';
  const localRootDir = isAbsolute(configuredDir)
    ? configuredDir
    : join(apiPackageRoot(), configuredDir);

  const urlPrefix = '/' + (process.env.ASSET_URL_PREFIX ?? 'uploads').replace(/^\/+|\/+$/g, '');

  const port = Number(process.env.API_PORT ?? 4000);
  const publicBaseUrl = (
    process.env.ASSET_PUBLIC_BASE_URL ?? `http://localhost:${port}`
  ).replace(/\/+$/, '');

  return { driver, localRootDir, urlPrefix, publicBaseUrl };
}
