import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { uniqueConflict } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportTypeDto, UpdateReportTypeDto } from './dto';

@Injectable()
export class ReportTypesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.reportType.findMany({
      orderBy: { name: 'asc' },
      include: {
        category: { select: { id: true, name: true } },
        _count: { select: { definitionVersions: true, submissions: true } },
      },
    });
  }

  async get(id: string) {
    const reportType = await this.prisma.reportType.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        definitionVersions: {
          orderBy: { version: 'desc' },
          select: { id: true, version: true, status: true, schemaSource: true, publishedAt: true },
        },
      },
    });
    if (!reportType) throw new NotFoundException('Report type not found');
    return reportType;
  }

  async create(dto: CreateReportTypeDto) {
    const category = await this.prisma.reportCategory.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new BadRequestException('Report category not found');
    try {
      return await this.prisma.reportType.create({
        data: {
          categoryId: dto.categoryId,
          code: dto.code.trim(),
          name: dto.name.trim(),
          description: dto.description?.trim(),
          defaultFrequency: dto.defaultFrequency,
        },
        include: { category: { select: { id: true, name: true } } },
      });
    } catch (e) {
      throw uniqueConflict(e, 'A report type with this code already exists');
    }
  }

  async update(id: string, dto: UpdateReportTypeDto) {
    await this.get(id);
    if (dto.categoryId !== undefined) {
      const category = await this.prisma.reportCategory.findUnique({ where: { id: dto.categoryId } });
      if (!category) throw new BadRequestException('Report category not found');
    }
    const data: Prisma.ReportTypeUpdateInput = {};
    if (dto.categoryId !== undefined) data.category = { connect: { id: dto.categoryId } };
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description.trim();
    if (dto.defaultFrequency !== undefined) data.defaultFrequency = dto.defaultFrequency;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.reportType.update({
      where: { id },
      data,
      include: { category: { select: { id: true, name: true } } },
    });
  }
}
