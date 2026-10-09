import { Controller, HttpCode, Post } from '@nestjs/common';
import { RequireCapability } from '../common/decorators';
import { RemindersService } from './reminders.service';

/**
 * Manual trigger for the deadline/overdue reminder sweep (Phase 17). The sweep
 * normally runs on a daily cron; this `run_reminders`-gated endpoint lets an
 * admin run it on demand (and makes the phase verifiable without waiting for the
 * clock). It is idempotent — a slot already reminded is not notified again.
 */
@Controller('reminders')
@RequireCapability('run_reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Post('run')
  @HttpCode(200)
  run() {
    return this.reminders.runSweep(new Date());
  }
}
