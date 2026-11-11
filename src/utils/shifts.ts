export type { ShiftNumber } from '../types';
import { ShiftNumber } from '../types';

export interface ShiftInfo {
  shift: ShiftNumber;
  name: string;
  shortLabel: string;
  timeRange: string;
  startTime: string; // e.g. "07:01"
  endTime: string;   // e.g. "15:00"
  durationHours: number; // 8 hours (or 7 net production hours)
  colorClass: string;
  badgeBg: string;
  borderClass: string;
  description: string;
}

export const SHIFTS_CONFIG: Record<number, ShiftInfo> = {
  1: {
    shift: 1,
    name: 'Shift 1 (Pagi)',
    shortLabel: 'Shift 1',
    timeRange: '07:01 - 15:00',
    startTime: '07:01',
    endTime: '15:00',
    durationHours: 8,
    colorClass: 'text-sky-400',
    badgeBg: 'bg-sky-500/15 text-sky-300',
    borderClass: 'border-sky-500/30',
    description: 'Shift Pagi operasional utama'
  },
  2: {
    shift: 2,
    name: 'Shift 2 (Sore)',
    shortLabel: 'Shift 2',
    timeRange: '15:01 - 23:00',
    startTime: '15:01',
    endTime: '23:00',
    durationHours: 8,
    colorClass: 'text-amber-400',
    badgeBg: 'bg-amber-500/15 text-amber-300',
    borderClass: 'border-amber-500/30',
    description: 'Shift Sore lanjutan operasional'
  },
  3: {
    shift: 3,
    name: 'Shift 3 (Malam)',
    shortLabel: 'Shift 3',
    timeRange: '23:01 - 07:00',
    startTime: '23:01',
    endTime: '07:00',
    durationHours: 8,
    colorClass: 'text-purple-400',
    badgeBg: 'bg-purple-500/15 text-purple-300',
    borderClass: 'border-purple-500/30',
    description: 'Shift Malam pergantian hari'
  }
};

/**
 * Determine active shift based on current time:
 * - Shift 1: 07:01 - 15:00
 * - Shift 2: 15:01 - 23:00
 * - Shift 3: 23:01 - 07:00
 */
export function getCurrentShift(date = new Date()): ShiftInfo {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  // 07:01 = 7*60 + 1 = 421 minutes
  // 15:00 = 15*60 = 900 minutes
  // 15:01 = 15*60 + 1 = 901 minutes
  // 23:00 = 23*60 = 1380 minutes
  // 23:01 = 23*60 + 1 = 1381 minutes
  // 07:00 = 7*60 = 420 minutes
  if (totalMinutes >= 421 && totalMinutes <= 900) {
    return SHIFTS_CONFIG[1];
  } else if (totalMinutes >= 901 && totalMinutes <= 1380) {
    return SHIFTS_CONFIG[2];
  } else {
    return SHIFTS_CONFIG[3];
  }
}

/**
 * Extract shift from an ISO datetime or timestamp
 */
export function getShiftFromTime(timeString?: string): ShiftInfo {
  if (!timeString) return getCurrentShift();
  try {
    const d = new Date(timeString);
    if (!isNaN(d.getTime())) {
      return getCurrentShift(d);
    }
  } catch {
    // fallback
  }
  return getCurrentShift();
}

/**
 * Format Indonesian Calendar Date e.g. "Minggu, 25 Oktober 2026"
 */
export function formatIndonesianDate(date = new Date()): string {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const dayName = days[date.getDay()];
  const day = date.getDate();
  const monthName = months[date.getMonth()];
  const year = date.getFullYear();

  return `${dayName}, ${day} ${monthName} ${year}`;
}
