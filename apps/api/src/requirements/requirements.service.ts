import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { uniqueConflict } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRequirementDto, UpdateRequirementDto } from './dto';

/**
 * Reporting requirements: which labs are expected to submit which report type.
 * A null laboratoryId expects all active laboratories. This drives
 * expected-vs-submitted compliance (Phase 8). Admin-only.
 */
@Injectable()
export class RequirementsService {
  constructor(private readonly prisma: PrismaService) {}

  list(reportTypeId?: string) {
    return this.prisma.reportingRequirement.findMany({
      where: reportTypeId ? { reportTypeId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        reportType: { select: { id: true, name: true, code: true } },
        laboratory: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async create(dto: CreateRequirementDto) {
    const reportType = await this.prisma.reportType.findUnique({ where: { id: dto.reportTypeId } });
    if (!reportType) throw new BadRequestException('Report type not found');

    const laboratoryId = dto.laboratoryId ?? null;
    if (laboratoryId) {
      const lab = await this.prisma.laboratory.findUnique({ where: { id: laboratoryId } });
      if (!lab) throw new BadRequestException('Laboratory not found');
    }

    try {
      return await this.prisma.reportingRequirement.create({
        data: { reportTypeId: dto.reportTypeId, laboratoryId },
      });
    } catch (e) {
      throw uniqueConflict(e, 'A requirement for this report type and laboratory already exists');
    }
  }

  async update(id: string, dto: UpdateRequirementDto) {
    const existing = await this.prisma.reportingRequirement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Requirement not found');
    return this.prisma.reportingRequirement.update({
      where: { id },
      data: { isActive: dto.isActive },
    });
  }
}
