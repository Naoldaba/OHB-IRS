import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RoleName } from '@ohb/shared';
import { Roles, CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { SubmissionsService } from './submissions.service';
import {
  AddFeedbackDto,
  CreateSubmissionDto,
  ListSubmissionsQueryDto,
  RequestRevisionDto,
  UpdateSubmissionDataDto,
} from './dto';

/**
 * Report submissions and their workflow. Reads are lab-scoped (a lab sees only
 * its own); lab authoring actions are REGIONAL_LAB_HEAD-only; review actions are
 * BUREAU_ADMIN-only. Server-side scoping is authoritative (see the service).
 */
@Controller('submissions')
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Get()
  list(@Query() query: ListSubmissionsQueryDto, @CurrentUser() user: AuthUser) {
    return this.submissions.list(user, query);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.submissions.getDetail(id, user);
  }

  @Get(':id/feedback')
  feedback(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.submissions.listFeedback(id, user);
  }

  @Get(':id/versions')
  versions(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.submissions.listVersions(id, user);
  }

  // ---- Lab authoring --------------------------------------------------------

  @Post()
  @Roles(RoleName.REGIONAL_LAB_HEAD)
  create(@Body() dto: CreateSubmissionDto, @CurrentUser() user: AuthUser) {
    return this.submissions.create(user, dto);
  }

  @Patch(':id')
  @Roles(RoleName.REGIONAL_LAB_HEAD)
  updateData(
    @Param('id') id: string,
    @Body() dto: UpdateSubmissionDataDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.submissions.updateData(id, user, dto);
  }

  @Post(':id/submit')
  @Roles(RoleName.REGIONAL_LAB_HEAD)
  submit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.submissions.submit(id, user);
  }

  @Post(':id/resubmit')
  @Roles(RoleName.REGIONAL_LAB_HEAD)
  resubmit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.submissions.resubmit(id, user);
  }

  // ---- Admin review ---------------------------------------------------------

  @Post(':id/review/start')
  @Roles(RoleName.BUREAU_ADMIN)
  startReview(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.submissions.startReview(id, user);
  }

  @Post(':id/review/request-revision')
  @Roles(RoleName.BUREAU_ADMIN)
  requestRevision(
    @Param('id') id: string,
    @Body() dto: RequestRevisionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.submissions.requestRevision(id, user, dto);
  }

  @Post(':id/review/approve')
  @Roles(RoleName.BUREAU_ADMIN)
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.submissions.approve(id, user);
  }

  // Both the Bureau and the owning laboratory may comment / reply (threads are a
  // two-way conversation). The service scopes lab access and blocks a lab from
  // raising a revision request. No @Roles → any authenticated user, then scoped.
  @Post(':id/feedback')
  addFeedback(
    @Param('id') id: string,
    @Body() dto: AddFeedbackDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.submissions.addFeedback(id, user, dto);
  }
}
