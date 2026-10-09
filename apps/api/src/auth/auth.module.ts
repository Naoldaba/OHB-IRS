import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';
import { AuthController } from './auth.controller';

@Module({
  providers: [AuthService, TwoFactorService],
  controllers: [AuthController],
  // Exported so the admin Users module can reset a user's 2FA (lost-device path).
  exports: [TwoFactorService],
})
export class AuthModule {}
