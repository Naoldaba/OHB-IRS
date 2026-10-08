import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { RoleName } from '@ohb/shared';

const prisma = new PrismaClient();

/** Regional laboratories from CLAUDE.md. Seeded as data, never hard-coded in logic. */
const LABORATORIES = [
  'Adama',
  'Neqemte',
  'Shashemene',
  'Fiche',
  'Bulehora',
  'Negele',
  'Ginir',
  'Yabelo',
  'Dembidolo',
];

function labCode(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, '_');
}

async function main() {
  // Roles
  const roles = [
    { name: RoleName.BUREAU_ADMIN, description: 'Oromia Regional Health Bureau administrator' },
    { name: RoleName.REGIONAL_LAB_HEAD, description: 'Regional laboratory head' },
  ];
  for (const r of roles) {
    await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: r,
    });
  }
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.BUREAU_ADMIN } });
  const labRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.REGIONAL_LAB_HEAD } });

  // Laboratories
  for (const name of LABORATORIES) {
    await prisma.laboratory.upsert({
      where: { name },
      update: {},
      create: { name, code: labCode(name) },
    });
  }

  // Initial Bureau Administrator
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@ohb.local').toLowerCase();
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: await hash(process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345', 10),
      fullName: process.env.SEED_ADMIN_NAME ?? 'Bureau Administrator',
      roleId: adminRole.id,
    },
  });

  // One test Regional Lab Head (for verifying lab-scoped access locally)
  const labName = process.env.SEED_LABHEAD_LAB ?? 'Adama';
  const lab = await prisma.laboratory.findUnique({ where: { name: labName } });
  if (lab) {
    const labEmail = (process.env.SEED_LABHEAD_EMAIL ?? 'labhead@ohb.local').toLowerCase();
    await prisma.user.upsert({
      where: { email: labEmail },
      update: {},
      create: {
        email: labEmail,
        passwordHash: await hash(process.env.SEED_LABHEAD_PASSWORD ?? 'Lab@12345', 10),
        fullName: process.env.SEED_LABHEAD_NAME ?? 'Lab Head',
        roleId: labRole.id,
        laboratoryId: lab.id,
      },
    });
  }

  const labCount = await prisma.laboratory.count();
  const userCount = await prisma.user.count();
  // eslint-disable-next-line no-console
  console.log(`Seed complete: ${labCount} laboratories, ${userCount} users.`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
