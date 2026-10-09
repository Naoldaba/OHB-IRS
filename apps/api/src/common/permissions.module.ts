import { Global, Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';

/**
 * Makes the capability resolver available everywhere (the global auth guards
 * and RolesService both depend on it) without each module re-providing it.
 */
@Global()
@Module({
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
