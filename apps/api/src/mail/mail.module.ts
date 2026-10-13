import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * Provides {@link MailService} application-wide. Global so any feature (password
 * reset today, deadline reminders later) can inject it without re-importing.
 */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
