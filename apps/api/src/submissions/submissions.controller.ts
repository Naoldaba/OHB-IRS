import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { RequireCapability, CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { ATTACHMENT_MAX_BYTES, SubmissionsService } from './submissions.service';
import {
  AddFeedbackDto,
  ApproveSubmissionDto,
  CreateSubmissionDto,
  ExportSubmissionQueryDto,
  ListSubmissionsQueryDto,
  RequestRevisionDto,
  ResolveFeedbackDto,
  UpdateSubmissionDataDto,
  UploadAttachmentDto,
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

  /** Users who may be @mentioned on this submission (admins + the owning lab's
   *  heads). Access-scoped like any other read. Drives the mention autocomplete. */
  @Get(':id/mentionable-users')
  mentionableUsers(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.submissions.mentionableUsers(id, user);
  }

  @Get(':id/versions')
  versions(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.submissions.listVersions(id, user);
  }

  /** Ordered lifecycle timeline (Phase 21). Access-scoped like any other read. */
  @Get(':id/timeline')
  timeline(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.submissions.timeline(id, user);
  }

  /**
   * Download the submission as Excel / DOCX / PDF. Scoped like any other read
   * (admins any lab; a lab head only its own) by the service.
   */
  @Get(':id/export')
  async export(
    @Param('id') id: string,
    @Query() query: ExportSubmissionQueryDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, contentType, filename } = await this.submissions.exportSubmission(
      id,
      user,
      query.format,
      query.version,
    );
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });
    return new StreamableFile(buffer);
  }

  // ---- Attachments ----------------------------------------------------------

  /** Supporting documents on a submission. Scoped read (admins any lab; a lab its own). */
  @Get(':id/attachments')
  listAttachments(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.submissions.listAttachments(id, user);
  }

  /** Upload a supporting document. Owning laboratory only; editable states only. */
  @Post(':id/attachments')
  @RequireCapability('manage_attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: ATTACHMENT_MAX_BYTES },
    }),
  )
  uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadAttachmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.submissions.addAttachment(id, user, file, dto);
  }

  /** Download an attachment's bytes (credentialed, access-scoped). */
  @Get(':id/attachments/:attachmentId/download')
  async downloadAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, fileName, mimeType } = await this.submissions.downloadAttachment(
      id,
      attachmentId,
      user,
    );
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Content-Length': String(buffer.length),
    });
    return new StreamableFile(buffer);
  }

  /** Remove an attachment. Owning laboratory only; editable states only. */
  @Delete(':id/attachments/:attachmentId')
  @RequireCapability('manage_attachments')
  removeAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.submissions.removeAttachment(id, attachmentId, user);
  }

  // ---- Lab authoring --------------------------------------------------------

  @Post()
  @RequireCapability('create_reports')
  create(@Body() dto: CreateSubmissionDto, @CurrentUser() user: AuthUser) {
    return this.submissions.create(user, dto);
  }

  @Patch(':id')
  @RequireCapability('edit_report_drafts')
  updateData(
    @Param('id') id: string,
    @Body() dto: UpdateSubmissionDataDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.submissions.updateData(id, user, dto);
  }

  @Post(':id/submit')
  @RequireCapability('submit_reports')
  submit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.submissions.submit(id, user);
  }

  @Post(':id/resubmit')
  @RequireCapability('submit_reports')
  resubmit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.submissions.resubmit(id, user);
  }

  // ---- Admin review ---------------------------------------------------------

  @Post(':id/review/start')
  @RequireCapability('review_submissions')
  startReview(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.submissions.startReview(id, user);
  }

  @Post(':id/review/request-revision')
  @RequireCapability('request_revisions')
  requestRevision(
    @Param('id') id: string,
    @Body() dto: RequestRevisionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.submissions.requestRevision(id, user, dto);
  }

  @Post(':id/review/approve')
  @RequireCapability('approve_reports')
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveSubmissionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.submissions.approve(id, user, dto);
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

  // Resolve / reopen a feedback thread. Either party that can see the submission
  // may do this (service-scoped); only a thread root can be resolved.
  @Post(':id/feedback/:feedbackId/resolve')
  resolveFeedback(
    @Param('id') id: string,
    @Param('feedbackId') feedbackId: string,
    @Body() dto: ResolveFeedbackDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.submissions.resolveThread(id, feedbackId, user, dto.resolved);
  }
}
