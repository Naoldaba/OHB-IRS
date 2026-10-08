import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditAction } from '@ohb/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateLabDto, UpdateLabDto } from './dto';

/** Derives a canonical lab code from a display name (same rule as the seed). */
function deriveCode(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, '_');
}

@Injectable()
export class LabsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.laboratory.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true } } },
    });
  }

  async get(id: string) {
    const lab = await this.prisma.laboratory.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!lab) throw new NotFoundException('Laboratory not found');
    return lab;
  }

  async create(dto: CreateLabDto, actorId: string) {
    const name = dto.name.trim();
    const code = dto.code?.trim() || deriveCode(name);
    try {
      const lab = await this.prisma.laboratory.create({ data: { name, code } });
      await this.audit.record({
        action: AuditAction.LAB_CREATED,
        actorId,
        entityType: 'Laboratory',
        entityId: lab.id,
        metadata: { name: lab.name, code: lab.code },
      });
      return lab;
    } catch (e) {
      throw this.translateUniqueError(e);
    }
  }

  async update(id: string, dto: UpdateLabDto, actorId: string) {
    await this.get(id); // 404 if missing

    const data: Prisma.LaboratoryUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.code !== undefined) data.code = dto.code.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      const lab = await this.prisma.laboratory.update({ where: { id }, data });
      await this.audit.record({
        action: AuditAction.LAB_UPDATED,
        actorId,
        entityType: 'Laboratory',
        entityId: lab.id,
        metadata: { changes: data },
      });
      return lab;
    } catch (e) {
      throw this.translateUniqueError(e);
    }
  }

  /** Maps a Prisma unique-constraint violation to a 409 on name or code. */
  private translateUniqueError(e: unknown): unknown {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      const target = (e.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
      return new ConflictException(`A laboratory with this ${target} already exists`);
    }
    return e;
  }
}
