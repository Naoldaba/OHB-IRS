import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { RemindersService } from './reminders.service';
import { RemindersController } from './reminders.controller';

// AnalyticsModule exports AnalyticsService (the expected-slot source); the
// NotificationsModule is @Global, so its service is injectable without import.
@Module({
  imports: [AnalyticsModule],
  providers: [RemindersService],
  controllers: [RemindersController],
})
export class RemindersModule {}
