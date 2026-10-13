/*
 * Dev helper for Phase 17 (deadline/overdue reminders).
 *
 * Creates two "expected-but-unsubmitted" reporting periods on the seeded
 * HIV Viral Load report type so you can exercise BOTH reminder paths in the UI:
 *   - an "Approaching" period due 2 days from now  -> DEADLINE_APPROACHING
 *   - an "Overdue"     period due 3 days ago        -> REPORT_OVERDUE
 *
 * The HIV Viral Load type has an all-labs requirement and a published
 * definition, so these slots are expected of every lab and the "What's due"
 * create-draft flow works. Only labs that have an active head receive a notice
 * (the seed gives Adama a head: labhead@ohb.local).
 *
 * Usage (from apps/api):
 *   node scripts/seed-reminder-demo.js          # create / refresh the demo slots
 *   node scripts/seed-reminder-demo.js --clean  # remove them and their reminders
 *
 * After creating, trigger the sweep as an admin and check the lab head's bell:
 *   POST http://localhost:4000/api/reminders/run
 */
'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const REPORT_TYPE_CODE = 'hiv_viral_load';
const DEMO_YEAR = 2099; // out of the way of real Ethiopian-calendar periods
const DAY = 86400000;

// Stable identities so re-running refreshes rather than duplicates.
const SLOTS = [
  { periodNumber: 101, label: 'Reminder Demo — Approaching', startOffDays: -5, dueOffDays: +2 },
  { periodNumber: 102, label: 'Reminder Demo — Overdue', startOffDays: -20, dueOffDays: -3 },
];

async function main() {
  const clean = process.argv.includes('--clean');
  const rt = await prisma.reportType.findUnique({ where: { code: REPORT_TYPE_CODE } });
  if (!rt) {
    console.error(`Report type "${REPORT_TYPE_CODE}" not found — run the DB seed first (npm run prisma:seed).`);
    process.exit(1);
  }

  const periodNumbers = SLOTS.map((s) => s.periodNumber);
  const demoPeriods = await prisma.reportingPeriod.findMany({
    where: { reportTypeId: rt.id, year: DEMO_YEAR, periodNumber: { in: periodNumbers } },
    select: { id: true },
  });
  const demoPeriodIds = demoPeriods.map((p) => p.id);

  if (clean) {
    // Reminder notices for these slots, then markers, then any drafts, then periods.
    await prisma.notification.deleteMany({
      where: { type: { in: ['DEADLINE_APPROACHING', 'REPORT_OVERDUE'] }, body: { contains: 'Reminder Demo' } },
    });
    if (demoPeriodIds.length) {
      await prisma.reminderDispatch.deleteMany({ where: { reportingPeriodId: { in: demoPeriodIds } } });
      await prisma.reportSubmission.deleteMany({ where: { reportingPeriodId: { in: demoPeriodIds } } });
      await prisma.reportingPeriod.deleteMany({ where: { id: { in: demoPeriodIds } } });
    }
    console.log(`Cleaned ${demoPeriodIds.length} demo period(s) and their reminders.`);
    return;
  }

  const now = Date.now();
  for (const s of SLOTS) {
    const startDate = new Date(now + s.startOffDays * DAY);
    const dueDate = new Date(now + s.dueOffDays * DAY);
    const endDate = new Date(now + (s.dueOffDays + 1) * DAY);
    await prisma.reportingPeriod.upsert({
      where: { reportTypeId_year_periodNumber: { reportTypeId: rt.id, year: DEMO_YEAR, periodNumber: s.periodNumber } },
      update: { label: s.label, startDate, endDate, dueDate },
      create: {
        reportTypeId: rt.id, periodType: 'MONTHLY', year: DEMO_YEAR, periodNumber: s.periodNumber,
        label: s.label, startDate, endDate, dueDate,
      },
    });
    // Clear this slot's prior markers/notices so the sweep re-sends on demand.
    const period = await prisma.reportingPeriod.findUnique({
      where: { reportTypeId_year_periodNumber: { reportTypeId: rt.id, year: DEMO_YEAR, periodNumber: s.periodNumber } },
      select: { id: true },
    });
    if (period) await prisma.reminderDispatch.deleteMany({ where: { reportingPeriodId: period.id } });
    console.log(`Ready: "${s.label}" — due ${dueDate.toDateString()}`);
  }
  await prisma.notification.deleteMany({
    where: { type: { in: ['DEADLINE_APPROACHING', 'REPORT_OVERDUE'] }, body: { contains: 'Reminder Demo' } },
  });

  console.log(
    '\nDemo slots ready on the HIV Viral Load report type.\n' +
      'Next: trigger the sweep as an admin, then open the lab head bell (labhead@ohb.local).\n' +
      '  curl -c c.txt -X POST http://localhost:4000/api/auth/login -H "content-type: application/json" -d "{\\"email\\":\\"admin@ohb.local\\",\\"password\\":\\"Admin@12345\\"}"\n' +
      '  curl -b c.txt -X POST http://localhost:4000/api/reminders/run',
  );
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
