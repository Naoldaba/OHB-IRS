import { Global, Logger, Module } from '@nestjs/common';
import { LocalDiskStorage } from './local-disk.storage';
import { loadStorageConfig } from './storage.config';
import { STORAGE, StorageProvider } from './storage.provider';

/**
 * Provides the configured {@link StorageProvider} under the {@link STORAGE}
 * token. Global so any feature (auth profile today, attachments later) can
 * inject it. The driver is selected from `STORAGE_DRIVER`; only `local` ships
 * today — cloud drivers slot in here without touching callers.
 */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE,
      useFactory: (): StorageProvider => {
        const cfg = loadStorageConfig();
        if (cfg.driver !== 'local') {
          new Logger('StorageModule').warn(
            `STORAGE_DRIVER="${cfg.driver}" is not implemented yet; falling back to local disk.`,
          );
        }
        return new LocalDiskStorage(cfg.localRootDir, cfg.publicBaseUrl, cfg.urlPrefix);
      },
    },
  ],
  exports: [STORAGE],
})
export class StorageModule {}
