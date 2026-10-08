import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { LabsModule } from './labs/labs.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { ReportTypesModule } from './report-types/report-types.module';
import { DefinitionVersionsModule } from './definition-versions/definition-versions.module';
import { RulesModule } from './rules/rules.module';
import { ReportingPeriodsModule } from './reporting-periods/reporting-periods.module';
import { RequirementsModule } from './requirements/requirements.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StorageModule } from './storage/storage.module';
import { MailModule } from './mail/mail.module';
import { AppController } from './app.controller';
import { SessionAuthGuard, RolesGuard } from './common/guards';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    LabsModule,
    UsersModule,
    CategoriesModule,
    ReportTypesModule,
    DefinitionVersionsModule,
    RulesModule,
    ReportingPeriodsModule,
    RequirementsModule,
    SubmissionsModule,
    AnalyticsModule,
    NotificationsModule,
    StorageModule,
    MailModule,
  ],
  controllers: [AppController],
  providers: [
    // Order matters: authenticate first, then authorize by role.
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
