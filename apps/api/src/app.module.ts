import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { LabsModule } from './labs/labs.module';
import { UsersModule } from './users/users.module';
import { AppController } from './app.controller';
import { SessionAuthGuard, RolesGuard } from './common/guards';

@Module({
  imports: [PrismaModule, AuditModule, AuthModule, LabsModule, UsersModule],
  controllers: [AppController],
  providers: [
    // Order matters: authenticate first, then authorize by role.
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
