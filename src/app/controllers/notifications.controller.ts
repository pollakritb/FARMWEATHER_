import { Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../http/decorators/current-user.decorator';
import { AuthUser } from '../models/auth.types';
import { NotificationsService } from '../services/notifications.service';

@ApiTags('notifications')
@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('plots/:plotId/notifications')
  findByPlot(@Param('plotId') plotId: string, @CurrentUser() user: AuthUser) {
    return this.notifications.findByPlot(plotId, user.id);
  }

  @Patch('notifications/:id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.notifications.markRead(id, user.id);
  }
}
