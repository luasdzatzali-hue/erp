import { AppState, ProductionLine } from '../types';

export interface ResolvedLineInfo {
  lineId: string;
  lineName: string;
  lineCode?: string;
}

function normalizeToken(val: string): string {
  return String(val || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function stripParentheses(val: string): string {
  return String(val || '')
    .replace(/\([^)]*\)/g, '')
    .trim();
}

/**
 * Matches a raw line label (e.g., "Line A", "A", "1", "Line 1 (Biskuit Domestik)", "LINE-B")
 * against master.productionLines or builds a consistent custom ResolvedLineInfo.
 */
export function normalizeProductionLine(
  rawLineLabel?: string,
  productionLines?: ProductionLine[],
  explicitLineId?: string
): ResolvedLineInfo | null {
  const lines = productionLines || [];

  if (explicitLineId) {
    const byId = lines.find(l => l.id === explicitLineId);
    if (byId) {
      return { lineId: byId.id, lineName: byId.name, lineCode: byId.code };
    }
  }

  const trimmed = (rawLineLabel || '').trim();
  if (!trimmed) return null;

  const trimmedLower = trimmed.toLowerCase();
  const token = normalizeToken(trimmed);
  const baseLabel = stripParentheses(trimmed);
  const baseToken = normalizeToken(baseLabel);

  // Direct match on id, code, or name
  for (const l of lines) {
    if (
      l.id.toLowerCase() === trimmedLower ||
      l.code.toLowerCase() === trimmedLower ||
      l.name.toLowerCase() === trimmedLower
    ) {
      return { lineId: l.id, lineName: l.name, lineCode: l.code };
    }
  }

  // Normalized token match (e.g., "LINE-A" === "Line A", or "A" matches "Line A")
  for (const l of lines) {
    const nameTok = normalizeToken(l.name);
    const codeTok = normalizeToken(l.code);
    const suffixOnly = nameTok.replace(/^line/, '');
    if (
      token === nameTok ||
      token === codeTok ||
      (baseToken && (baseToken === nameTok || baseToken === codeTok)) ||
      (token.length <= 3 && suffixOnly === token)
    ) {
      return { lineId: l.id, lineName: l.name, lineCode: l.code };
    }
  }

  // Format plain short labels like "1", "2", "3A" as "Line 1", "Line 2", "Line 3A"
  const formattedName =
    /^\d+[a-z]?$/i.test(trimmed) || /^[a-z]$/i.test(trimmed)
      ? `Line ${trimmed.toUpperCase()}`
      : trimmed;

  return {
    lineId: explicitLineId || `line_${normalizeToken(formattedName) || 'custom'}`,
    lineName: formattedName,
    lineCode: formattedName.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12)
  };
}

/**
 * Resolves the Production Line for a given context (Order Item, BOM Request, SKU/WIP).
 */
export function resolveProductionLineForItem(
  state: AppState,
  context: {
    explicitLineId?: string;
    explicitLineName?: string;
    skuId?: string;
    wipId?: string;
  }
): ResolvedLineInfo {
  const lines = state.master.productionLines || [];

  // 1. Explicit line stored on item/request
  if (context.explicitLineId || context.explicitLineName) {
    const resolvedExplicit = normalizeProductionLine(
      context.explicitLineName,
      lines,
      context.explicitLineId
    );
    if (resolvedExplicit) return resolvedExplicit;
  }

  // 2. Active or recent production run on this SKU
  if (context.skuId) {
    const activeRuns =
      state.activeSkuRuns && state.activeSkuRuns.length > 0
        ? state.activeSkuRuns
        : state.activeSkuRun
        ? [state.activeSkuRun]
        : [];
    const matchingRun =
      activeRuns.find(r => r.isRunning && r.skuId === context.skuId && (r.lineId || r.lineName)) ||
      activeRuns.find(r => r.skuId === context.skuId && (r.lineId || r.lineName));
    if (matchingRun) {
      const resolvedRun = normalizeProductionLine(
        matchingRun.lineName,
        lines,
        matchingRun.lineId
      );
      if (resolvedRun) return resolvedRun;
    }
  }

  // 3. Active Weekly Production Plan item matching SKU
  if (context.skuId) {
    const plans = state.weeklyPlannings || [];
    const activePlan =
      plans.find(p => p.id === state.activeWeeklyPlanId) || plans[0] || null;
    if (activePlan) {
      const matchedItems = activePlan.items.filter(
        it => it.matchedSkuId === context.skuId && (it.line || '').trim() !== ''
      );
      if (matchedItems.length > 0) {
        // Prefer item with highest totalProduksi if multiple lines appear
        const bestItem = matchedItems
          .slice()
          .sort((a, b) => (b.totalProduksi || 0) - (a.totalProduksi || 0))[0];
        const resolvedPlanLine = normalizeProductionLine(bestItem.line, lines);
        if (resolvedPlanLine) return resolvedPlanLine;
      }
    }
  }

  // 4. WIP assigned machine's line
  if (context.wipId) {
    const wip = state.master.wips.find(w => w.id === context.wipId);
    if (wip) {
      const machIds =
        wip.assignedMachineIds && wip.assignedMachineIds.length > 0
          ? wip.assignedMachineIds
          : wip.assignedMachineId
          ? [wip.assignedMachineId]
          : [];
      for (const mId of machIds) {
        const mach = state.master.machines.find(m => m.id === mId);
        if (mach?.line) {
          const resolvedMachLine = normalizeProductionLine(mach.line, lines);
          if (resolvedMachLine) return resolvedMachLine;
        }
      }
    }
  }

  // 5. Carton production logs for this SKU
  if (context.skuId) {
    const logs = state.transactions.cartonProductions || [];
    for (let i = logs.length - 1; i >= 0; i--) {
      const cp = logs[i];
      if (cp.skuId === context.skuId && (cp.lineId || cp.lineName)) {
        const resolvedCpLine = normalizeProductionLine(cp.lineName, lines, cp.lineId);
        if (resolvedCpLine) return resolvedCpLine;
      }
    }
  }

  // 6. Fallback generic line
  return {
    lineId: 'line_umum',
    lineName: 'Line Umum',
    lineCode: 'UMUM'
  };
}

/**
 * Returns all distinct Production Lines associated with a (SKU, WIP) pair,
 * splitting cleanly if the SKU is scheduled across multiple lines in Weekly Planning or active runs.
 */
export function resolveProductionLinesForSkuWip(
  state: AppState,
  skuId: string,
  wipId: string
): ResolvedLineInfo[] {
  const lines = state.master.productionLines || [];
  const collected = new Map<string, ResolvedLineInfo>();

  const addLine = (info: ResolvedLineInfo | null) => {
    if (!info) return;
    if (!collected.has(info.lineId)) {
      collected.set(info.lineId, info);
    }
  };

  // Check active Weekly Planning items for this SKU
  const plans = state.weeklyPlannings || [];
  const activePlan =
    plans.find(p => p.id === state.activeWeeklyPlanId) || plans[0] || null;
  if (activePlan) {
    activePlan.items
      .filter(it => it.matchedSkuId === skuId && (it.line || '').trim() !== '' && !it.isOffProduction)
      .forEach(it => {
        addLine(normalizeProductionLine(it.line, lines));
      });
  }

  // Check active runs on this SKU
  const activeRuns =
    state.activeSkuRuns && state.activeSkuRuns.length > 0
      ? state.activeSkuRuns
      : state.activeSkuRun
      ? [state.activeSkuRun]
      : [];
  activeRuns
    .filter(r => r.skuId === skuId && (r.lineId || r.lineName))
    .forEach(r => {
      addLine(normalizeProductionLine(r.lineName, lines, r.lineId));
    });

  if (collected.size > 0) {
    return Array.from(collected.values());
  }

  // Fallback to single resolved line (WIP machine / carton log / Line Umum)
  return [resolveProductionLineForItem(state, { skuId, wipId })];
}

/**
 * Returns all selectable Production Line options across master.productionLines,
 * active weekly plan items, and machines.
 */
export function getSelectableProductionLines(state: AppState): ResolvedLineInfo[] {
  const masterLines = state.master.productionLines || [];
  const map = new Map<string, ResolvedLineInfo>();

  masterLines.forEach(l => {
    if (!map.has(l.id)) {
      map.set(l.id, { lineId: l.id, lineName: l.name, lineCode: l.code });
    }
  });

  const plans = state.weeklyPlannings || [];
  const activePlan =
    plans.find(p => p.id === state.activeWeeklyPlanId) || plans[0] || null;
  activePlan?.items.forEach(it => {
    const info = normalizeProductionLine(it.line, masterLines);
    if (info && !map.has(info.lineId)) {
      map.set(info.lineId, info);
    }
  });

  (state.master.machines || []).forEach(m => {
    const info = normalizeProductionLine(m.line, masterLines);
    if (info && !map.has(info.lineId)) {
      map.set(info.lineId, info);
    }
  });

  return Array.from(map.values());
}
