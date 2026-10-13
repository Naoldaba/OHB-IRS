import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditAction } from '@ohb/shared';
import { uniqueConflict } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

/**
 * Report categories group report types (e.g. "Routine Lab Report"). Admin-only.
 *
 * Categories form a self-referential tree (adjacency list): a category may nest
 * under a parent to arbitrary depth. Names are unique *within* a parent, not
 * globally; the backend is authoritative for cycle prevention and the
 * delete/reparent guards.
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.reportCategory.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { reportTypes: true, children: true } },
      },
    });
  }

  async get(id: string) {
    const category = await this.prisma.reportCategory.findUnique({
      where: { id },
      include: {
        reportTypes: { orderBy: { name: 'asc' } },
        _count: { select: { reportTypes: true, children: true } },
      },
    });
    if (!category) throw new NotFoundException('Report category not found');
    return category;
  }

  async create(dto: CreateCategoryDto, actorId: string) {
    const name = dto.name.trim();
    const parentId = dto.parentId ?? null;
    if (parentId) await this.requireExists(parentId);
    await this.assertNameFree(parentId, name, null);
    try {
      const category = await this.prisma.reportCategory.create({
        data: { name, description: dto.description?.trim(), parentId },
      });
      await this.audit.record({
        action: AuditAction.CATEGORY_CREATED,
        actorId,
        entityType: 'ReportCategory',
        entityId: category.id,
        metadata: { name: category.name, parentId },
      });
      return category;
    } catch (e) {
      throw uniqueConflict(e, 'A report category with this name already exists here');
    }
  }

  async update(id: string, dto: UpdateCategoryDto, actorId: string) {
    const current = await this.requireExists(id);

    const data: Prisma.ReportCategoryUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description.trim();

    // Re-parenting: validate the new parent exists, is not the category itself
    // or one of its descendants (cycle), then set it (null => top-level).
    const reparenting = dto.parentId !== undefined;
    const nextParentId = reparenting ? dto.parentId ?? null : current.parentId;
    if (reparenting) {
      if (nextParentId) {
        if (nextParentId === id) {
          throw new BadRequestException('A category cannot be its own parent');
        }
        await this.requireExists(nextParentId);
        await this.assertNotDescendant(id, nextParentId);
      }
      data.parent = nextParentId
        ? { connect: { id: nextParentId } }
        : { disconnect: true };
    }

    // Name must stay unique within the (possibly new) parent.
    const nextName = dto.name !== undefined ? dto.name.trim() : current.name;
    if (dto.name !== undefined || reparenting) {
      await this.assertNameFree(nextParentId, nextName, id);
    }

    try {
      const category = await this.prisma.reportCategory.update({ where: { id }, data });
      const changes: Record<string, unknown> = {};
      if (dto.name !== undefined) changes.name = nextName;
      if (dto.description !== undefined) changes.description = data.description;
      if (reparenting) changes.parentId = nextParentId;
      await this.audit.record({
        action: AuditAction.CATEGORY_UPDATED,
        actorId,
        entityType: 'ReportCategory',
        entityId: category.id,
        metadata: { changes },
      });
      return category;
    } catch (e) {
      throw uniqueConflict(e, 'A report category with this name already exists here');
    }
  }

  async remove(id: string, actorId: string) {
    const category = await this.get(id);
    if (category._count.children > 0) {
      throw new ConflictException(
        'Move or delete the sub-categories first; this category still has children',
      );
    }
    if (category._count.reportTypes > 0) {
      throw new ConflictException(
        'Reassign or remove its report types first; this category is still in use',
      );
    }
    await this.prisma.reportCategory.delete({ where: { id } });
    await this.audit.record({
      action: AuditAction.CATEGORY_DELETED,
      actorId,
      entityType: 'ReportCategory',
      entityId: id,
      metadata: { name: category.name, parentId: category.parentId },
    });
    return { id };
  }

  /** Loads a category or throws 404. */
  private async requireExists(id: string) {
    const category = await this.prisma.reportCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Report category not found');
    return category;
  }

  /**
   * Walks up from `candidateParentId` through the parent chain; if we reach
   * `id`, the candidate is a descendant of `id` and using it as a parent would
   * create a cycle.
   */
  private async assertNotDescendant(id: string, candidateParentId: string) {
    let cursor: string | null = candidateParentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === id) {
        throw new BadRequestException(
          'A category cannot be moved under one of its own descendants',
        );
      }
      if (seen.has(cursor)) break; // defensive: never loop on pre-existing bad data
      seen.add(cursor);
      const node: { parentId: string | null } | null =
        await this.prisma.reportCategory.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        });
      cursor = node?.parentId ?? null;
    }
  }

  /**
   * Enforces per-parent name uniqueness at the application layer. The DB
   * composite unique index backs this for non-null parents, but Postgres treats
   * NULLs as distinct, so top-level duplicates are only caught here.
   */
  private async assertNameFree(
    parentId: string | null,
    name: string,
    excludeId: string | null,
  ) {
    const clash = await this.prisma.reportCategory.findFirst({
      where: {
        parentId,
        name,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(
        'A report category with this name already exists here',
      );
    }
  }
}
