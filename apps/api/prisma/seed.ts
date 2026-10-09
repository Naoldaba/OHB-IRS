import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import {
  PeriodType,
  ReportDefinitionStatus,
  RoleName,
  SchemaSource,
  ETHIOPIAN_MONTHS,
  ethiopianMonthRange,
  hivViralLoadDefinition,
  toFieldSchema,
} from '@ohb/shared';

const prisma = new PrismaClient();

/**
 * Regional laboratories from CLAUDE.md. Seeded as data, never hard-coded in
 * logic. Each carries the approximate [latitude, longitude] of its town so the
 * Phase 21 compliance map has something to plot on a fresh database; these are
 * seed defaults only — an admin manages coordinates through the Labs screen and
 * re-seeding never overwrites an edited value (coordinates are set on create).
 */
const LABORATORIES: { name: string; coords: [number, number] }[] = [
  { name: 'Adama', coords: [8.54, 39.27] },
  { name: 'Neqemte', coords: [9.09, 36.55] },
  { name: 'Shashemene', coords: [7.2, 38.6] },
  { name: 'Fiche', coords: [9.8, 38.73] },
  { name: 'Bulehora', coords: [5.58, 38.25] },
  { name: 'Negele', coords: [5.33, 39.58] },
  { name: 'Ginir', coords: [7.13, 40.7] },
  { name: 'Yabelo', coords: [4.88, 38.08] },
  { name: 'Dembidolo', coords: [8.53, 34.8] },
];

function labCode(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, '_');
}

async function main() {
  // Roles
  const roles = [
    { name: RoleName.BUREAU_ADMIN, description: 'Oromia Health Bureau administrator' },
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

  // Laboratories. Coordinates are backfilled only where still unset, so a fresh
  // database is plottable immediately while an admin's later edits are never
  // overwritten by a re-seed.
  for (const { name, coords } of LABORATORIES) {
    await prisma.laboratory.upsert({
      where: { name },
      update: {},
      create: { name, code: labCode(name), latitude: coords[0], longitude: coords[1] },
    });
    await prisma.laboratory.updateMany({
      where: { name, latitude: null, longitude: null },
      data: { latitude: coords[0], longitude: coords[1] },
    });
  }

  // Initial Bureau Administrator
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@ohb.local').toLowerCase();
  const admin = await prisma.user.upsert({
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

  // ---- Reference report: HIV Viral Load (Phase 3 verification seed) ---------
  // Seeds the report type plus a PUBLISHED definition version (schema snapshot
  // from the code registry) so a lab can create/fill/submit through the full
  // lifecycle before the admin Report Builder (Phase 4) exists. Phase 4 verifies
  // the admin can author the same structure through the UI with no code.
  const category = await prisma.reportCategory.upsert({
    where: { name: hivViralLoadDefinition.category },
    update: {},
    create: { name: hivViralLoadDefinition.category },
  });

  const reportType = await prisma.reportType.upsert({
    where: { code: hivViralLoadDefinition.code },
    update: {},
    create: {
      code: hivViralLoadDefinition.code,
      name: hivViralLoadDefinition.name,
      categoryId: category.id,
      defaultFrequency: hivViralLoadDefinition.defaultFrequency,
    },
  });

  // A single published v1 definition, pinned by submissions created against it.
  await prisma.reportDefinitionVersion.upsert({
    where: { reportTypeId_version: { reportTypeId: reportType.id, version: 1 } },
    update: {},
    create: {
      reportTypeId: reportType.id,
      version: 1,
      status: ReportDefinitionStatus.PUBLISHED,
      schemaSource: SchemaSource.REGISTRY,
      fieldSchema: toFieldSchema(hivViralLoadDefinition) as object,
      createdById: admin.id,
      publishedById: admin.id,
      publishedAt: new Date(),
    },
  });

  // A sample monthly reporting period (Ethiopian year 2017, month 1 / Fulbaana).
  const periodYear = 2017;
  const periodNumber = 1;
  const range = ethiopianMonthRange(periodYear, periodNumber);
  await prisma.reportingPeriod.upsert({
    where: {
      reportTypeId_year_periodNumber: {
        reportTypeId: reportType.id,
        year: periodYear,
        periodNumber,
      },
    },
    update: {},
    create: {
      reportTypeId: reportType.id,
      periodType: PeriodType.MONTHLY,
      year: periodYear,
      periodNumber,
      label: `${ETHIOPIAN_MONTHS[periodNumber - 1]} ${periodYear}`,
      startDate: range.start,
      endDate: range.endExclusive,
      dueDate: range.endExclusive,
    },
  });

  // Expectation: every active laboratory submits this report (laboratoryId null).
  const existingRequirement = await prisma.reportingRequirement.findFirst({
    where: { reportTypeId: reportType.id, laboratoryId: null },
  });
  if (!existingRequirement) {
    await prisma.reportingRequirement.create({
      data: { reportTypeId: reportType.id, laboratoryId: null },
    });
  }

  const labCount = await prisma.laboratory.count();
  const userCount = await prisma.user.count();
  const reportTypeCount = await prisma.reportType.count();
  // eslint-disable-next-line no-console
  console.log(
    `Seed complete: ${labCount} laboratories, ${userCount} users, ${reportTypeCount} report type(s).`,
  );
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
