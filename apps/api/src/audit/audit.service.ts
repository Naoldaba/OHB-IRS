import { Injectable } from '@nestjs/common';
import { AuditAction } from '@ohb/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  action: AuditAction;
  actorId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: entry.action,
        actorId: entry.actorId ?? null,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata ? (entry.metadata as object) : undefined,
      },
    });
  }

  list(limit = 100) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { actor: { select: { id: true, fullName: true, email: true } } },
    });
  }
}
