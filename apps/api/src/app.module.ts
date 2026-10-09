import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { LabsModule } from './labs/labs.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { CategoriesModule } from './categories/categories.module';
import { ReportTypesModule } from './report-types/report-types.module';
import { DefinitionVersionsModule } from './definition-versions/definition-versions.module';
import { ReportImportModule } from './report-import/report-import.module';
import { RulesModule } from './rules/rules.module';
import { ReportingPeriodsModule } from './reporting-periods/reporting-periods.module';
import { RequirementsModule } from './requirements/requirements.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { SearchModule } from './search/search.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RemindersModule } from './reminders/reminders.module';
import { StorageModule } from './storage/storage.module';
import { MailModule } from './mail/mail.module';
import { AppController } from './app.controller';
import { PermissionsModule } from './common/permissions.module';
import { SessionAuthGuard, RolesGuard, PermissionsGuard } from './common/guards';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    PermissionsModule,
    AuditModule,
    AuthModule,
    LabsModule,
    UsersModule,
    RolesModule,
    CategoriesModule,
    ReportTypesModule,
    DefinitionVersionsModule,
    ReportImportModule,
    RulesModule,
    ReportingPeriodsModule,
    RequirementsModule,
    SubmissionsModule,
    SearchModule,
    AnalyticsModule,
    NotificationsModule,
    RemindersModule,
    StorageModule,
    MailModule,
  ],
  controllers: [AppController],
  providers: [
    // Order matters: authenticate first (resolves the principal's capabilities),
    // then authorize — by capability (Phase 28), with the legacy role guard kept
    // as a harmless pass-through (no @Roles sites remain).
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
