import { WeeklyPlanDayKey, WeeklyProductionPlan } from '../types';

export const MONTH_SHORT_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des'
] as const;

export const DAY_NAMES_ID = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu'
] as const;

export const ORDERED_DAY_KEYS: WeeklyPlanDayKey[] = [
  'senin',
  'selasa',
  'rabu',
  'kamis',
  'jumat',
  'sabtu',
  'minggu'
];

export interface OfficialIsoWeekInfo {
  isoYear: number;
  isoWeek: number;
  mondayDate: Date;
  sundayDate: Date;
  mondayIso: string;
  sundayIso: string;
  weekLabel: string;
  shortWeekLabel: string;
  titleSuggestion: string;
  rangeLabelId: string;
  fullRangeLabelId: string;
  dayDates: Partial<Record<WeeklyPlanDayKey, string>>;
}

export interface OfficialWeekOption {
  isoYear: number;
  isoWeek: number;
  mondayIso: string;
  sundayIso: string;
  optionLabel: string;
  isCurrentWeek: boolean;
  isNextWeek: boolean;
}

export function parseIsoDateLocal(isoStr: string | undefined | null): Date | null {
  if (!isoStr) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoStr.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    return null;
  }
  return dt;
}

export function toIsoDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysLocal(d: Date, offsetDays: number): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
  copy.setDate(copy.getDate() + offsetDays);
  return copy;
}

export function addDaysIso(isoStr: string, offsetDays: number): string {
  const parsed = parseIsoDateLocal(isoStr);
  if (!parsed) return isoStr;
  return toIsoDateStr(addDaysLocal(parsed, offsetDays));
}

export function formatDateShortId(isoStr: string, includeYear = false): string {
  const dt = parseIsoDateLocal(isoStr);
  if (!dt) return isoStr;
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = MONTH_SHORT_ID[dt.getMonth()] || '';
  return includeYear ? `${dd} ${mm} ${dt.getFullYear()}` : `${dd} ${mm}`;
}

export function formatFullDateId(isoStr: string): string {
  const dt = parseIsoDateLocal(isoStr);
  if (!dt) return isoStr;
  const dayName = DAY_NAMES_ID[dt.getDay()] || '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = MONTH_SHORT_ID[dt.getMonth()] || '';
  return `${dayName}, ${dd} ${mm} ${dt.getFullYear()}`;
}

/**
 * Computes official ISO-8601 week-year and week number (1..53).
 * Week 1 is the Monday-to-Sunday week containing January 4th (first Thursday).
 */
export function getIsoWeekYearAndNumber(dateInput: Date | string): {
  isoYear: number;
  isoWeek: number;
} {
  const d =
    typeof dateInput === 'string'
      ? parseIsoDateLocal(dateInput) || new Date()
      : new Date(dateInput);

  const utcTarget = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = utcTarget.getUTCDay() || 7; // Mon = 1 ... Sun = 7
  utcTarget.setUTCDate(utcTarget.getUTCDate() + 4 - dayNum);
  const isoYear = utcTarget.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(((utcTarget.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { isoYear, isoWeek };
}

/**
 * Returns total ISO-8601 weeks in the given calendar year (52 or 53).
 * December 28 is always guaranteed to fall inside the last ISO week of its year.
 */
export function getIsoWeeksInYear(isoYear: number): number {
  const dec28 = new Date(isoYear, 11, 28, 12, 0, 0, 0);
  return getIsoWeekYearAndNumber(dec28).isoWeek;
}

/**
 * Returns the local Date (12:00:00) for Monday of the given ISO year and ISO week.
 */
export function getMondayOfIsoWeek(isoYear: number, isoWeek: number): Date {
  const maxWeeks = getIsoWeeksInYear(isoYear);
  const safeWeek = Math.max(1, Math.min(maxWeeks, Math.floor(isoWeek) || 1));

  // Jan 4 is always in ISO Week 1 of isoYear
  const jan4 = new Date(isoYear, 0, 4, 12, 0, 0, 0);
  const jan4Day = jan4.getDay() || 7; // Mon=1..Sun=7
  const week1Monday = new Date(isoYear, 0, 4 - (jan4Day - 1), 12, 0, 0, 0);
  return addDaysLocal(week1Monday, (safeWeek - 1) * 7);
}

export function buildDayDatesFromStart(
  periodStartIso: string
): Partial<Record<WeeklyPlanDayKey, string>> {
  const base = parseIsoDateLocal(periodStartIso);
  if (!base) return {};
  const map: Partial<Record<WeeklyPlanDayKey, string>> = {};
  ORDERED_DAY_KEYS.forEach((dayKey, idx) => {
    const dt = addDaysLocal(base, idx);
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = MONTH_SHORT_ID[dt.getMonth()] || '';
    map[dayKey] = `${dd}-${mm}`;
  });
  return map;
}

export function getOfficialIsoWeekRange(
  isoYear: number,
  isoWeek: number
): OfficialIsoWeekInfo {
  const maxWeeks = getIsoWeeksInYear(isoYear);
  const clampedWeek = Math.max(1, Math.min(maxWeeks, Math.floor(isoWeek) || 1));
  const mondayDate = getMondayOfIsoWeek(isoYear, clampedWeek);
  const sundayDate = addDaysLocal(mondayDate, 6);
  const mondayIso = toIsoDateStr(mondayDate);
  const sundayIso = toIsoDateStr(sundayDate);

  const sameYearSpan = mondayDate.getFullYear() === sundayDate.getFullYear();
  const rangeLabelId = sameYearSpan
    ? `${formatDateShortId(mondayIso, false)} – ${formatDateShortId(sundayIso, true)}`
    : `${formatDateShortId(mondayIso, true)} – ${formatDateShortId(sundayIso, true)}`;

  const fullRangeLabelId = `${formatFullDateId(mondayIso)} s/d ${formatFullDateId(sundayIso)}`;
  const shortWeekLabel = `WEEK ${clampedWeek}`;
  const weekLabel = `WEEK ${clampedWeek} - ${isoYear}`;
  const titleSuggestion = `RENCANA PRODUKSI MINGGUAN - WEEK ${clampedWeek} (${isoYear})`;

  return {
    isoYear,
    isoWeek: clampedWeek,
    mondayDate,
    sundayDate,
    mondayIso,
    sundayIso,
    weekLabel,
    shortWeekLabel,
    titleSuggestion,
    rangeLabelId,
    fullRangeLabelId,
    dayDates: buildDayDatesFromStart(mondayIso)
  };
}

export function getOfficialIsoWeekFromDate(dateInput: Date | string): OfficialIsoWeekInfo {
  const { isoYear, isoWeek } = getIsoWeekYearAndNumber(dateInput);
  return getOfficialIsoWeekRange(isoYear, isoWeek);
}

export function shiftIsoWeek(
  isoYear: number,
  isoWeek: number,
  deltaWeeks: number
): OfficialIsoWeekInfo {
  const monday = getMondayOfIsoWeek(isoYear, isoWeek);
  const shifted = addDaysLocal(monday, deltaWeeks * 7);
  return getOfficialIsoWeekFromDate(shifted);
}

export function buildOfficialWeekOptions(
  isoYear: number,
  todayRef: Date = new Date()
): OfficialWeekOption[] {
  const todayInfo = getOfficialIsoWeekFromDate(todayRef);
  const nextInfo = shiftIsoWeek(todayInfo.isoYear, todayInfo.isoWeek, 1);
  const totalWeeks = getIsoWeeksInYear(isoYear);
  const options: OfficialWeekOption[] = [];

  for (let w = 1; w <= totalWeeks; w++) {
    const info = getOfficialIsoWeekRange(isoYear, w);
    const isCurrentWeek = info.isoYear === todayInfo.isoYear && info.isoWeek === todayInfo.isoWeek;
    const isNextWeek = info.isoYear === nextInfo.isoYear && info.isoWeek === nextInfo.isoWeek;
    const wkPadded = String(w).padStart(2, '0');
    const tag = isCurrentWeek ? ' · Minggu Ini' : isNextWeek ? ' · Minggu Depan' : '';
    options.push({
      isoYear,
      isoWeek: w,
      mondayIso: info.mondayIso,
      sundayIso: info.sundayIso,
      optionLabel: `Week ${wkPadded} (${formatDateShortId(info.mondayIso)} – ${formatDateShortId(info.sundayIso)})${tag}`,
      isCurrentWeek,
      isNextWeek
    });
  }

  return options;
}

export function extractWeekNumberFromLabel(label: string | undefined | null): number | null {
  if (!label) return null;
  const match = /(?:week|wk|minggu|w)\s*[-#: ]*(\d{1,2})/i.exec(label);
  if (!match) return null;
  const num = Number(match[1]);
  return num >= 1 && num <= 53 ? num : null;
}

export function resolvePlanIsoWeek(
  plan: Pick<WeeklyProductionPlan, 'periodStart' | 'weekLabel' | 'uploadedAt'>
): { isoYear: number; isoWeek: number } | null {
  const parsedStart = parseIsoDateLocal(plan.periodStart);
  if (parsedStart) {
    return getIsoWeekYearAndNumber(parsedStart);
  }
  const wkFromLabel = extractWeekNumberFromLabel(plan.weekLabel);
  if (!wkFromLabel) return null;

  const yearMatch = /(20\d{2})/.exec(plan.weekLabel || '');
  if (yearMatch) {
    return { isoYear: Number(yearMatch[1]), isoWeek: wkFromLabel };
  }
  if (plan.uploadedAt) {
    const up = new Date(plan.uploadedAt);
    if (!isNaN(up.getTime())) {
      return { isoYear: up.getFullYear(), isoWeek: wkFromLabel };
    }
  }
  return null;
}

export function findDuplicateWeekPlan(
  plans: WeeklyProductionPlan[],
  isoYear: number,
  isoWeek: number,
  mondayIso: string,
  excludePlanId?: string | null
): WeeklyProductionPlan | undefined {
  return plans.find(p => {
    if (excludePlanId && p.id === excludePlanId) return false;
    if (p.periodStart === mondayIso) return true;
    const resolved = resolvePlanIsoWeek(p);
    return resolved !== null && resolved.isoYear === isoYear && resolved.isoWeek === isoWeek;
  });
}

export interface CurrentYearCalendarBounds {
  currentYear: number;
  totalWeeks: number;
  minDateIso: string;
  maxDateIso: string;
  firstWeekInfo: OfficialIsoWeekInfo;
  lastWeekInfo: OfficialIsoWeekInfo;
}

export interface WeeklyDateValidationResult {
  isValid: boolean;
  errorMessage: string | null;
  resolvedYear: number | null;
  resolvedWeek: number | null;
  bounds: CurrentYearCalendarBounds;
}

/**
 * Computes the official ISO-8601 calendar week boundaries for the system context's current year.
 */
export function getCurrentYearCalendarBounds(
  referenceDate: Date = new Date()
): CurrentYearCalendarBounds {
  const currentYear = referenceDate.getFullYear();
  const totalWeeks = getIsoWeeksInYear(currentYear);
  const firstWeekInfo = getOfficialIsoWeekRange(currentYear, 1);
  const lastWeekInfo = getOfficialIsoWeekRange(currentYear, totalWeeks);
  return {
    currentYear,
    totalWeeks,
    minDateIso: firstWeekInfo.mondayIso,
    maxDateIso: lastWeekInfo.sundayIso,
    firstWeekInfo,
    lastWeekInfo
  };
}

/**
 * Validates that a picked calendar date falls strictly within the current year's official calendar weeks.
 */
export function validateProductionDateInCurrentYearWeeks(
  dateIso: string,
  referenceDate: Date = new Date()
): WeeklyDateValidationResult {
  const bounds = getCurrentYearCalendarBounds(referenceDate);
  const parsed = parseIsoDateLocal(dateIso);
  if (!parsed) {
    return {
      isValid: false,
      errorMessage: `Tanggal tidak valid. Pilih tanggal antara ${formatDateShortId(
        bounds.minDateIso,
        true
      )} s/d ${formatDateShortId(bounds.maxDateIso, true)} (Week 01–${String(
        bounds.totalWeeks
      ).padStart(2, '0')} tahun ${bounds.currentYear}).`,
      resolvedYear: null,
      resolvedWeek: null,
      bounds
    };
  }

  const { isoYear, isoWeek } = getIsoWeekYearAndNumber(parsed);
  if (
    isoYear !== bounds.currentYear ||
    isoWeek < 1 ||
    isoWeek > bounds.totalWeeks ||
    dateIso < bounds.minDateIso ||
    dateIso > bounds.maxDateIso
  ) {
    return {
      isValid: false,
      errorMessage: `Tanggal ${formatFullDateId(dateIso)} masuk Week ${String(isoWeek).padStart(
        2,
        '0'
      )} tahun ${isoYear}, di luar rentang minggu kalender tahun berjalan ${bounds.currentYear} (${formatDateShortId(
        bounds.minDateIso,
        true
      )} – ${formatDateShortId(bounds.maxDateIso, true)}).`,
      resolvedYear: isoYear,
      resolvedWeek: isoWeek,
      bounds
    };
  }

  return {
    isValid: true,
    errorMessage: null,
    resolvedYear: isoYear,
    resolvedWeek: isoWeek,
    bounds
  };
}

/**
 * Validates that a draft weekly plan's year, ISO week, and Senin–Minggu boundaries strictly align
 * with the current system year's official calendar weeks.
 */
export function validateWeeklyPlanSelectionInCurrentYear(
  selectedYear: number,
  selectedWeek: number,
  periodStartIso: string,
  periodEndIso: string,
  referenceDate: Date = new Date()
): WeeklyDateValidationResult {
  const bounds = getCurrentYearCalendarBounds(referenceDate);

  if (selectedYear !== bounds.currentYear) {
    return {
      isValid: false,
      errorMessage: `Tahun jadwal (${selectedYear}) harus sesuai dengan tahun kalender aktif sistem (${bounds.currentYear}, Week 01–${String(
        bounds.totalWeeks
      ).padStart(2, '0')}).`,
      resolvedYear: selectedYear,
      resolvedWeek: selectedWeek,
      bounds
    };
  }

  if (selectedWeek < 1 || selectedWeek > bounds.totalWeeks) {
    return {
      isValid: false,
      errorMessage: `Nomor minggu (${selectedWeek}) di luar rentang kalender resmi tahun ${bounds.currentYear} (Week 01–${String(
        bounds.totalWeeks
      ).padStart(2, '0')}).`,
      resolvedYear: selectedYear,
      resolvedWeek: selectedWeek,
      bounds
    };
  }

  const canonical = getOfficialIsoWeekRange(bounds.currentYear, selectedWeek);
  if (periodStartIso !== canonical.mondayIso || periodEndIso !== canonical.sundayIso) {
    return {
      isValid: false,
      errorMessage: `Rentang tanggal (${periodStartIso || '-'} s/d ${
        periodEndIso || '-'
      }) tidak selaras dengan Senin–Minggu resmi Week ${String(selectedWeek).padStart(
        2,
        '0'
      )} ${bounds.currentYear} (${canonical.mondayIso} s/d ${canonical.sundayIso}).`,
      resolvedYear: selectedYear,
      resolvedWeek: selectedWeek,
      bounds
    };
  }

  return {
    isValid: true,
    errorMessage: null,
    resolvedYear: bounds.currentYear,
    resolvedWeek: canonical.isoWeek,
    bounds
  };
}
