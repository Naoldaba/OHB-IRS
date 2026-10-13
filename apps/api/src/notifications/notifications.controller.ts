import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { NotificationsService } from './notifications.service';
import { ListNotificationsQueryDto } from './dto';

/**
 * Every notification is addressed to a single recipient, so all routes are
 * implicitly scoped to the authenticated user — there is no cross-user read.
 * No @Roles: both Bureau admins and lab heads have their own inbox.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Query() query: ListNotificationsQueryDto, @CurrentUser() user: AuthUser) {
    return this.notifications.list(user, {
      unread: query.unread === 'true',
      limit: query.limit,
    });
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    return { count: await this.notifications.unreadCount(user) };
  }

  @Post(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.notifications.markRead(user, id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user);
  }
}
