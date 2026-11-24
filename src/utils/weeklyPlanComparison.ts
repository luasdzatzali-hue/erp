import { AppState, ShiftNumber, WeeklyPlanDayKey, WeeklyProductionPlan } from '../types';
import { WEEKLY_PLAN_DAYS } from './weeklyPlanningParser';

export interface SkuPlanVsActualRow {
  key: string;
  skuId?: string;
  skuCode: string;
  skuName: string;
  shortLabel: string;
  lines: string;
  plannedCartons: number;
  actualCartons: number;
  varianceCartons: number;
  achievementPct: number;
  status: 'TERCAPAI' | 'PROSES' | 'BELUM_MULAI' | 'UNPLANNED';
  isOffProduction: boolean;
}

export interface PlanVsActualSummary {
  plan: WeeklyProductionPlan | null;
  rows: SkuPlanVsActualRow[];
  totalPlanned: number;
  totalActual: number;
  netVariance: number;
  overallPct: number;
  completedSkuCount: number;
  totalActiveSkuCount: number;
}

function normalizeText(val: string): string {
  return String(val || '').trim().toLowerCase();
}

export function getActiveWeeklyPlan(state: AppState): WeeklyProductionPlan | null {
  const plans = state.weeklyPlannings || [];
  if (plans.length === 0) return null;
  if (state.activeWeeklyPlanId) {
    const found = plans.find(p => p.id === state.activeWeeklyPlanId);
    if (found) return found;
  }
  return plans[0];
}

export function buildSkuPlanVsActualSummary(
  state: AppState,
  options?: {
    shiftScope?: 'ALL' | ShiftNumber;
    dayScope?: 'ALL' | WeeklyPlanDayKey;
    actualWindow?: 'ALL_LOGS' | 'TODAY';
  }
): PlanVsActualSummary {
  const shiftScope = options?.shiftScope ?? 'ALL';
  const dayScope = options?.dayScope ?? 'ALL';
  const actualWindow = options?.actualWindow ?? 'ALL_LOGS';

  const plan = getActiveWeeklyPlan(state);
  const todayIso = new Date().toISOString().slice(0, 10);

  // Filter cartonProductions according to shift and time window
  const cartonLogs = (state.transactions.cartonProductions || []).filter(cp => {
    if (shiftScope !== 'ALL' && cp.shift !== shiftScope) return false;
    if (actualWindow === 'TODAY' && !(cp.timestamp || '').startsWith(todayIso)) {
      return false;
    }
    return true;
  });

  // Helper to resolve master SKU metadata
  const masterSkuById = new Map(state.master.skus.map(s => [s.id, s]));

  // Aggregate actual cartons by canonical SKU key
  const actualBySkuId = new Map<string, number>();
  const actualByCode = new Map<string, number>();
  const actualByName = new Map<string, number>();

  for (const cp of cartonLogs) {
    const qty = Number(cp.cartonsProduced) || 0;
    if (qty <= 0) continue;

    if (cp.skuId) {
      actualBySkuId.set(cp.skuId, (actualBySkuId.get(cp.skuId) || 0) + qty);
    }
    const master = cp.skuId ? masterSkuById.get(cp.skuId) : undefined;
    const codeKey = normalizeText(cp.skuCode || master?.code || '');
    if (codeKey) {
      actualByCode.set(codeKey, (actualByCode.get(codeKey) || 0) + qty);
    }
    const nameKey = normalizeText(cp.skuName || master?.name || '');
    if (nameKey) {
      actualByName.set(nameKey, (actualByName.get(nameKey) || 0) + qty);
    }
  }

  // Group planned items by canonical SKU so multi-line plans aggregate cleanly per SKU
  interface AggBucket {
    key: string;
    skuId?: string;
    skuCode: string;
    skuName: string;
    lineSet: Set<string>;
    plannedCartons: number;
    isOffProduction: boolean;
  }

  const buckets = new Map<string, AggBucket>();
  const consumedSkuIds = new Set<string>();
  const consumedCodes = new Set<string>();
  const consumedNames = new Set<string>();

  if (plan) {
    for (const item of plan.items) {
      const master = item.matchedSkuId ? masterSkuById.get(item.matchedSkuId) : undefined;
      const skuCode = (master?.code || item.rawSkuCode || '-').trim();
      const skuName = (master?.name || item.rawProductName || skuCode).trim();
      const canonicalKey =
        item.matchedSkuId ||
        (skuCode && skuCode !== '-' ? `code:${normalizeText(skuCode)}` : `name:${normalizeText(skuName)}`);

      let itemPlanned = 0;
      const shiftsToSum = shiftScope === 'ALL' ? [1, 2, 3] : [shiftScope];
      for (const sh of shiftsToSum) {
        const shiftRow = item.shifts.find(s => s.shift === sh);
        if (!shiftRow) continue;
        if (dayScope === 'ALL') {
          itemPlanned += Number(shiftRow.totalOutput) || 0;
        } else {
          itemPlanned += Number(shiftRow.dailyCartons?.[dayScope]) || 0;
        }
      }

      const existing = buckets.get(canonicalKey);
      if (existing) {
        existing.plannedCartons += itemPlanned;
        if (item.line && item.line !== '-') existing.lineSet.add(item.line);
        existing.isOffProduction = existing.isOffProduction && Boolean(item.isOffProduction);
      } else {
        const lineSet = new Set<string>();
        if (item.line && item.line !== '-') lineSet.add(item.line);
        buckets.set(canonicalKey, {
          key: canonicalKey,
          skuId: item.matchedSkuId,
          skuCode,
          skuName,
          lineSet,
          plannedCartons: itemPlanned,
          isOffProduction: Boolean(item.isOffProduction)
        });
      }
    }
  }

  const rows: SkuPlanVsActualRow[] = [];

  for (const bucket of buckets.values()) {
    let actualCartons = 0;
    if (bucket.skuId && actualBySkuId.has(bucket.skuId)) {
      actualCartons = actualBySkuId.get(bucket.skuId) || 0;
      consumedSkuIds.add(bucket.skuId);
    } else {
      const codeNorm = normalizeText(bucket.skuCode);
      const nameNorm = normalizeText(bucket.skuName);
      if (codeNorm && codeNorm !== '-' && actualByCode.has(codeNorm)) {
        actualCartons = actualByCode.get(codeNorm) || 0;
        consumedCodes.add(codeNorm);
      } else if (nameNorm && actualByName.has(nameNorm)) {
        actualCartons = actualByName.get(nameNorm) || 0;
        consumedNames.add(nameNorm);
      }
    }

    if (bucket.skuId) consumedSkuIds.add(bucket.skuId);
    if (bucket.skuCode && bucket.skuCode !== '-') consumedCodes.add(normalizeText(bucket.skuCode));
    consumedNames.add(normalizeText(bucket.skuName));

    const planned = Math.round(bucket.plannedCartons);
    const actual = Math.round(actualCartons);
    const variance = actual - planned;
    const achievementPct =
      planned > 0 ? Number(((actual / planned) * 100).toFixed(1)) : actual > 0 ? 100 : 0;

    const status: SkuPlanVsActualRow['status'] =
      planned === 0 && actual > 0
        ? 'UNPLANNED'
        : planned > 0 && actual >= planned
        ? 'TERCAPAI'
        : actual > 0
        ? 'PROSES'
        : 'BELUM_MULAI';

    const labelBase =
      bucket.skuCode && bucket.skuCode !== '-'
        ? `${bucket.skuCode} · ${bucket.skuName}`
        : bucket.skuName;
    const shortLabel =
      labelBase.length > 18 ? `${labelBase.slice(0, 16)}…` : labelBase;

    rows.push({
      key: bucket.key,
      skuId: bucket.skuId,
      skuCode: bucket.skuCode,
      skuName: bucket.skuName,
      shortLabel,
      lines: bucket.lineSet.size > 0 ? Array.from(bucket.lineSet).join(', ') : '-',
      plannedCartons: planned,
      actualCartons: actual,
      varianceCartons: variance,
      achievementPct,
      status,
      isOffProduction: bucket.isOffProduction && planned === 0 && actual === 0
    });
  }

  // Also include any actual production SKUs not present in the active plan so variance is never hidden
  const unplannedBySku = new Map<string, { skuId?: string; skuCode: string; skuName: string; lines: Set<string>; actual: number }>();
  for (const cp of cartonLogs) {
    const qty = Number(cp.cartonsProduced) || 0;
    if (qty <= 0) continue;
    const master = cp.skuId ? masterSkuById.get(cp.skuId) : undefined;
    const code = (cp.skuCode || master?.code || '-').trim();
    const name = (cp.skuName || master?.name || code).trim();
    const isAlreadyInPlan =
      (cp.skuId && consumedSkuIds.has(cp.skuId)) ||
      (code !== '-' && consumedCodes.has(normalizeText(code))) ||
      consumedNames.has(normalizeText(name));
    if (isAlreadyInPlan) continue;

    const uKey = cp.skuId || normalizeText(name);
    const ex = unplannedBySku.get(uKey);
    if (ex) {
      ex.actual += qty;
      if (cp.lineName) ex.lines.add(cp.lineName);
    } else {
      const lineSet = new Set<string>();
      if (cp.lineName) lineSet.add(cp.lineName);
      unplannedBySku.set(uKey, {
        skuId: cp.skuId,
        skuCode: code,
        skuName: name,
        lines: lineSet,
        actual: qty
      });
    }
  }

  for (const [uKey, u] of unplannedBySku.entries()) {
    const labelBase = u.skuCode !== '-' ? `${u.skuCode} · ${u.skuName}` : u.skuName;
    rows.push({
      key: `unplanned_${uKey}`,
      skuId: u.skuId,
      skuCode: u.skuCode,
      skuName: u.skuName,
      shortLabel: labelBase.length > 18 ? `${labelBase.slice(0, 16)}…` : labelBase,
      lines: u.lines.size > 0 ? Array.from(u.lines).join(', ') : '-',
      plannedCartons: 0,
      actualCartons: Math.round(u.actual),
      varianceCartons: Math.round(u.actual),
      achievementPct: 100,
      status: 'UNPLANNED',
      isOffProduction: false
    });
  }

  const activeRows = rows.filter(r => !r.isOffProduction);
  const totalPlanned = activeRows.reduce((s, r) => s + r.plannedCartons, 0);
  const totalActual = activeRows.reduce((s, r) => s + r.actualCartons, 0);
  const netVariance = totalActual - totalPlanned;
  const overallPct =
    totalPlanned > 0 ? Number(((totalActual / totalPlanned) * 100).toFixed(1)) : totalActual > 0 ? 100 : 0;
  const plannedRows = activeRows.filter(r => r.plannedCartons > 0);
  const completedSkuCount = plannedRows.filter(r => r.actualCartons >= r.plannedCartons).length;

  return {
    plan,
    rows: activeRows,
    totalPlanned,
    totalActual,
    netVariance,
    overallPct,
    completedSkuCount,
    totalActiveSkuCount: plannedRows.length
  };
}

export { WEEKLY_PLAN_DAYS };
