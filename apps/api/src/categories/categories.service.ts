import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { uniqueConflict } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

/** Report categories group report types (e.g. "Routine Lab Report"). Admin-only. */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.reportCategory.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { reportTypes: true } } },
    });
  }

  async get(id: string) {
    const category = await this.prisma.reportCategory.findUnique({
      where: { id },
      include: { reportTypes: { orderBy: { name: 'asc' } } },
    });
    if (!category) throw new NotFoundException('Report category not found');
    return category;
  }

  async create(dto: CreateCategoryDto) {
    try {
      return await this.prisma.reportCategory.create({
        data: { name: dto.name.trim(), description: dto.description?.trim() },
      });
    } catch (e) {
      throw uniqueConflict(e, 'A report category with this name already exists');
    }
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.get(id);
    const data: Prisma.ReportCategoryUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description.trim();
    try {
      return await this.prisma.reportCategory.update({ where: { id }, data });
    } catch (e) {
      throw uniqueConflict(e, 'A report category with this name already exists');
    }
  }
}
