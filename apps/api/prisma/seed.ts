import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import {
  PeriodType,
  RoleName,
  ROLE_CAPABILITIES,
  SYSTEM_ROLE_SCOPES,
} from '@ohb/shared';

const prisma = new PrismaClient();

/**
 * Seed = the minimal starting state:
 *   - the two system roles (with their capability grants + scope),
 *   - the nine regional laboratories (PHRRLC),
 *   - one Bureau Administrator and one Regional Lab Head,
 *   - the report-category tree and its leaf report types (from OHB_Report_Types).
 * Nothing else (no reporting periods, requirements, submissions, definitions,
 * feedback, notifications or audit entries) is created.
 */

/** Regional laboratories. Coordinates are the approximate town location for the map. */
const LABORATORIES: { name: string; coords: [number, number] }[] = [
  { name: 'Adama PHRRLC', coords: [8.54, 39.27] },
  { name: 'Neqemte PHRRLC', coords: [9.09, 36.55] },
  { name: 'Shashemene PHRRLC', coords: [7.2, 38.6] },
  { name: 'Fiche PHRRLC', coords: [9.8, 38.73] },
  { name: 'Bulehora PHRRLC', coords: [5.58, 38.25] },
  { name: 'Negele PHRRLC', coords: [5.33, 39.58] },
  { name: 'Ginir PHRRLC', coords: [7.13, 40.7] },
  { name: 'Yabelo PHRRLC', coords: [4.88, 38.08] },
  { name: 'Dembidolo PHRRLC', coords: [8.53, 34.8] },
];

/** The laboratory the seeded Regional Lab Head belongs to. */
const LABHEAD_LAB = 'Adama PHRRLC';

function labCode(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, '_');
}

/**
 * Report-category tree (source: OHB_Report_Types). A node with children is a
 * ReportCategory; a leaf is a ReportType created under its parent category. A
 * top-level leaf is wrapped in a same-named category so the report type has a
 * parent (ReportType requires a category).
 */
type Node = { name: string; children?: Node[] };

/** A sample-referral test: Postal / Alternative referral means as leaf report types. */
const referralTest = (name: string): Node => ({
  name,
  children: [{ name: 'Postal' }, { name: 'Alternative' }],
});

const REPORT_TREE: Node[] = [
  {
    name: 'Sample Referral',
    children: [
      referralTest('Viral load'),
      referralTest('Tb Xpert'),
      referralTest('EID'),
      referralTest('CD4'),
      referralTest('TB culture'),
      referralTest('HBV'),
      referralTest('HCV'),
      referralTest('HPV'),
    ],
  },
  {
    name: 'EQA Data',
    children: [
      { name: 'Random Blind Rechecking(RBR)' },
      {
        name: 'Professional Test (PT)',
        children: [
          { name: 'International PT (IPT)' },
          { name: 'National PT (NPT)' },
          { name: 'Regional PT(RPT)' },
        ],
      },
      { name: 'Onsite Evaluation(OSE)' },
    ],
  },
  { name: 'BioSafety and BioSecurity' },
  {
    name: 'Training',
    children: [
      { name: 'Training Performance Report' },
      { name: 'Training need' },
    ],
  },
  {
    name: 'Routine Lab Report',
    children: [
      { name: 'HIV Viral Load' },
      { name: 'TB Molecular Testing' },
      { name: 'Basic Culture and DST(Drug Susceptibility Test)' },
      { name: 'Essential Lab Testing' },
      { name: 'Water Test' },
      { name: 'Malaria Microscopy and RDT' },
      { name: 'HPV' },
      { name: 'Hepatitis B viral load(HBV)' },
      { name: 'Hepatitis C viral load(HCV)' },
      { name: 'CD4' },
      { name: 'CrAg' },
      { name: 'Chemistry' },
      { name: 'IA(Immuno Assy)' },
      { name: 'CBC' },
    ],
  },
  {
    name: 'Mentorship',
    children: [
      { name: 'SLIPTA Mentorship' },
      { name: 'LQMS Mentorship' },
      { name: 'Clinical Mentorship' },
    ],
  },
  { name: 'Supportive Supervision' },
];

/** A unique, stable report-type code from the full path (segments joined by `__`). */
function codeFromPath(path: string[]): string {
  return path
    .map((s) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, ''))
    .join('__');
}

/** Recursively create a node: a category when it has children, else a report type. */
async function createNode(node: Node, parentCategoryId: string | null, path: string[]) {
  const here = [...path, node.name];
  if (node.children && node.children.length > 0) {
    const category = await prisma.reportCategory.create({
      data: { name: node.name, parentId: parentCategoryId },
    });
    for (const child of node.children) {
      await createNode(child, category.id, here);
    }
    return;
  }

  // Leaf → report type. A report type must have a category; a top-level leaf is
  // wrapped in a same-named category so it has a parent.
  let categoryId = parentCategoryId;
  if (!categoryId) {
    const wrapper = await prisma.reportCategory.create({
      data: { name: node.name, parentId: null },
    });
    categoryId = wrapper.id;
  }
  await prisma.reportType.create({
    data: {
      categoryId,
      code: codeFromPath(here),
      name: node.name,
      defaultFrequency: PeriodType.MONTHLY,
      isActive: true,
    },
  });
}

async function main() {
  // Roles — the two system roles with their scope and capability grants.
  const roleIdByName: Record<string, string> = {};
  const roleDescriptions: Record<RoleName, string> = {
    [RoleName.BUREAU_ADMIN]: 'Oromia Health Bureau administrator',
    [RoleName.REGIONAL_LAB_HEAD]: 'Regional laboratory head',
  };
  for (const name of [RoleName.BUREAU_ADMIN, RoleName.REGIONAL_LAB_HEAD] as RoleName[]) {
    const role = await prisma.role.create({
      data: {
        name,
        description: roleDescriptions[name],
        scope: SYSTEM_ROLE_SCOPES[name],
        isSystem: true,
        isActive: true,
        permissions: {
          create: (ROLE_CAPABILITIES[name] ?? []).map((capabilityKey) => ({ capabilityKey })),
        },
      },
    });
    roleIdByName[name] = role.id;
  }

  // Laboratories.
  const labIdByName = new Map<string, string>();
  for (const { name, coords } of LABORATORIES) {
    const lab = await prisma.laboratory.create({
      data: { name, code: labCode(name), latitude: coords[0], longitude: coords[1] },
    });
    labIdByName.set(name, lab.id);
  }

  // One Bureau Administrator.
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@ohb.local').toLowerCase();
  await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash: await hash(process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345', 10),
      fullName: process.env.SEED_ADMIN_NAME ?? 'Bureau Administrator',
      roleId: roleIdByName[RoleName.BUREAU_ADMIN],
    },
  });

  // One Regional Lab Head, assigned to a laboratory.
  const labHeadLabId = labIdByName.get(LABHEAD_LAB);
  if (!labHeadLabId) throw new Error(`Lab-head laboratory not found: ${LABHEAD_LAB}`);
  const labEmail = (process.env.SEED_LABHEAD_EMAIL ?? 'labhead@ohb.local').toLowerCase();
  await prisma.user.create({
    data: {
      email: labEmail,
      passwordHash: await hash(process.env.SEED_LABHEAD_PASSWORD ?? 'Lab@12345', 10),
      fullName: process.env.SEED_LABHEAD_NAME ?? 'Lab Head',
      roleId: roleIdByName[RoleName.REGIONAL_LAB_HEAD],
      laboratoryId: labHeadLabId,
    },
  });

  // Report-category tree + leaf report types.
  for (const node of REPORT_TREE) {
    await createNode(node, null, []);
  }

  const [categories, reportTypes] = await Promise.all([
    prisma.reportCategory.count(),
    prisma.reportType.count(),
  ]);
  console.log(
    `Seeded: 2 roles, ${LABORATORIES.length} laboratories, 2 users, ` +
      `${categories} categories, ${reportTypes} report types.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
