import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Maps a Prisma unique-constraint violation (P2002) to a 409. */
export function uniqueConflict(e: unknown, message: string): unknown {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    return new ConflictException(message);
  }
  return e;
}

/** Maps a Prisma "record not found" (P2025) to a 404. */
export function notFound(e: unknown, message: string): unknown {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
    return new NotFoundException(message);
  }
  return e;
}
