/**
 * Ethiopian (Ge'ez) calendar utilities.
 *
 * The database stores canonical Gregorian/UTC dates; the UI presents and
 * accepts Ethiopian-calendar dates. These helpers convert between the two and
 * derive reporting-period ranges. Conversions use the Julian Day Number (JDN)
 * as an intermediate, which is exact for proleptic Gregorian dates.
 *
 * Timezone for the bureau is Africa/Addis Ababa (UTC+3, no DST).
 */

export const ADDIS_ABABA_TZ = 'Africa/Addis Ababa';

/** JDN of the Amete Mihret epoch used by the conversion formulas. */
const JD_EPOCH_OFFSET_AMETE_MIHRET = 1723856;

export interface CalendarDate {
  year: number;
  month: number; // 1-based
  day: number; // 1-based
}

/**
 * Ethiopian month names in Afaan Oromo (Oromia's working language). Listed in
 * Ethiopian-calendar order; each aligns with the month the Ethiopian one mostly
 * falls in (Meskerem ≈ September → Fulbaana, …). Month 13 is Qaammee (Pagume,
 * 5 or 6 days). The former Amharic transliterations are kept in
 * {@link ETHIOPIAN_MONTHS_AM} for reference / label migration.
 */
export const ETHIOPIAN_MONTHS: readonly string[] = [
  'Fulbaana', // Meskerem
  'Onkololeessa', // Tikimt
  'Sadaasa', // Hidar
  'Muddee', // Tahsas
  'Amajjii', // Tir
  'Guraandhala', // Yekatit
  'Bitooteessa', // Megabit
  'Eblaa', // Miazia
  'Caamsaa', // Ginbot
  'Waxabajjii', // Sene
  'Adooleessa', // Hamle
  'Hagayya', // Nehase
  'Qaammee', // Pagume
];

/** Former Amharic transliterations, in the same order — kept so stored labels
 *  generated under the old names can be detected and migrated. */
export const ETHIOPIAN_MONTHS_AM: readonly string[] = [
  'Meskerem',
  'Tikimt',
  'Hidar',
  'Tahsas',
  'Tir',
  'Yekatit',
  'Megabit',
  'Miazia',
  'Ginbot',
  'Sene',
  'Hamle',
  'Nehase',
  'Pagume',
];

function mod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

/** Proleptic Gregorian calendar date -> Julian Day Number. */
export function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/** Julian Day Number -> proleptic Gregorian calendar date. */
export function jdnToGregorian(jdn: number): CalendarDate {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: 100 * b + d - 4800 + Math.floor(m / 10),
  };
}

/** Ethiopian calendar date -> Julian Day Number. */
export function ethiopianToJdn(year: number, month: number, day: number): number {
  return (
    JD_EPOCH_OFFSET_AMETE_MIHRET +
    365 * year +
    Math.floor(year / 4) +
    30 * (month - 1) +
    (day - 1)
  );
}

/** Julian Day Number -> Ethiopian calendar date. */
export function jdnToEthiopian(jdn: number): CalendarDate {
  const offset = jdn - JD_EPOCH_OFFSET_AMETE_MIHRET;
  const r = mod(offset, 1461);
  const n = mod(r, 365) + 365 * Math.floor(r / 1460);
  return {
    year: 4 * Math.floor(offset / 1461) + Math.floor(r / 365) - Math.floor(r / 1460),
    month: Math.floor(n / 30) + 1,
    day: mod(n, 30) + 1,
  };
}

/** A Gregorian JS Date (interpreted in UTC) -> Ethiopian calendar date. */
export function toEthiopian(date: Date): CalendarDate {
  const jdn = gregorianToJdn(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
  return jdnToEthiopian(jdn);
}

/** An Ethiopian calendar date -> Gregorian JS Date at UTC midnight. */
export function toGregorianDate(year: number, month: number, day: number): Date {
  const g = jdnToGregorian(ethiopianToJdn(year, month, day));
  return new Date(Date.UTC(g.year, g.month - 1, g.day));
}

/** True when an Ethiopian year has 6 days in Pagume (leap year). */
export function isEthiopianLeapYear(year: number): boolean {
  return mod(year, 4) === 3;
}

export function ethiopianMonthLength(year: number, month: number): number {
  if (month < 13) return 30;
  return isEthiopianLeapYear(year) ? 6 : 5;
}

export function formatEthiopian(date: CalendarDate): string {
  return `${ETHIOPIAN_MONTHS[date.month - 1]} ${date.day}, ${date.year}`;
}

export interface GregorianRange {
  /** Inclusive first Gregorian day of the period (UTC midnight). */
  start: Date;
  /** Exclusive Gregorian day after the period ends (UTC midnight). */
  endExclusive: Date;
}

/**
 * Gregorian date range for a given Ethiopian month, suitable for storing the
 * canonical start/end of a monthly reporting period.
 */
export function ethiopianMonthRange(year: number, month: number): GregorianRange {
  const start = toGregorianDate(year, month, 1);
  const length = ethiopianMonthLength(year, month);
  const end = toGregorianDate(year, month, length);
  const endExclusive = new Date(end.getTime());
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { start, endExclusive };
}

/**
 * Months (1-based, inclusive) covered by each Ethiopian quarter. The Ethiopian
 * year has 13 months; the short 13th month (Pagume) is folded into Q4. This
 * folding is a system convention, not a domain rule from any specific report —
 * monthly periods are the primary path and avoid it entirely.
 */
const QUARTER_MONTHS: Record<number, [number, number]> = {
  1: [1, 3],
  2: [4, 6],
  3: [7, 9],
  4: [10, 13],
};

/** Gregorian range spanning a set of inclusive Ethiopian months. */
function spanMonths(year: number, firstMonth: number, lastMonth: number): GregorianRange {
  return {
    start: ethiopianMonthRange(year, firstMonth).start,
    endExclusive: ethiopianMonthRange(year, lastMonth).endExclusive,
  };
}

/** Gregorian range for an Ethiopian quarter (1-4). See {@link QUARTER_MONTHS}. */
export function ethiopianQuarterRange(year: number, quarter: number): GregorianRange {
  const months = QUARTER_MONTHS[quarter];
  if (!months) throw new Error(`Quarter must be 1-4 (got ${quarter})`);
  return spanMonths(year, months[0], months[1]);
}

/** Gregorian range for a full Ethiopian year (Meskerem 1 through Pagume). */
export function ethiopianYearRange(year: number): GregorianRange {
  return spanMonths(year, 1, 13);
}
