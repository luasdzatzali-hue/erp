import React, { useState, useMemo } from 'react';
import {
  useTable,
  tableFeatures,
  rowSortingFeature,
  createSortedRowModel,
  createColumnHelper,
  sortFn_alphanumeric,
  sortFn_datetime,
  SortingState,
} from '@tanstack/react-table';
import {
  X,
  History,
  Search,
  Clock,
  ShieldCheck,
  ArrowRight,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  ProductionMachine,
  MachineChangeoverRecord,
  ChangeoverType,
} from '../types';
import { SlideOverDrawer } from './ui/SlideOverDrawer';

interface MachineChangeoverHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  machines: ProductionMachine[];
  selectedMachineId?: string | null;
  allChangeovers: MachineChangeoverRecord[];
}

const changeoverTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    datetime: sortFn_datetime,
  },
});

const columnHelper = createColumnHelper<
  typeof changeoverTableFeatures,
  MachineChangeoverRecord
>();

const TYPE_META: Record<ChangeoverType, { label: string; colorClass: string }> = {
  MINOR: {
    label: 'Minor (Flavour Swap)',
    colorClass: 'text-brand',
  },
  MAJOR_ALLERGEN: {
    label: 'Major / Alergen',
    colorClass: 'text-ink-rose',
  },
  FULL_CIP: {
    label: 'Full CIP & Sanitasi',
    colorClass: 'text-ink-purple',
  },
  MOULD_TOOLING: {
    label: 'Ganti Tooling / Mould',
    colorClass: 'text-ink-amber',
  },
};

export const MachineChangeoverHistoryModal: React.FC<MachineChangeoverHistoryModalProps> = ({
  isOpen,
  onClose,
  machines,
  selectedMachineId: initialSelectedMachineId = null,
  allChangeovers,
}) => {
  const [filterMachineId, setFilterMachineId] = useState<string>(initialSelectedMachineId || 'ALL');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'timestamp', desc: true },
  ]);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setFilterMachineId(initialSelectedMachineId || 'ALL');
    }
  }, [isOpen, initialSelectedMachineId]);

  const consolidatedRecords = useMemo(() => {
    const listMap = new Map<string, MachineChangeoverRecord>();
    (allChangeovers || []).forEach(r => listMap.set(r.id, r));
    (machines || []).forEach(m => {
      (m.changeoverHistory || []).forEach(r => {
        if (!listMap.has(r.id)) {
          listMap.set(r.id, r);
        }
      });
    });

    return Array.from(listMap.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [allChangeovers, machines]);

  const filteredRecords = useMemo(() => {
    return consolidatedRecords.filter(r => {
      if (filterMachineId !== 'ALL' && r.machineId !== filterMachineId) return false;
      if (filterType !== 'ALL' && r.changeoverType !== filterType) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          r.machineCode.toLowerCase().includes(q) ||
          r.machineName.toLowerCase().includes(q) ||
          r.toWipName.toLowerCase().includes(q) ||
          (r.fromWipName || '').toLowerCase().includes(q) ||
          r.operatorName.toLowerCase().includes(q) ||
          (r.qcInspectorName || '').toLowerCase().includes(q) ||
          (r.notes || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [consolidatedRecords, filterMachineId, filterType, searchQuery]);

  const metrics = useMemo(() => {
    const total = filteredRecords.length;
    if (total === 0) {
      return { total: 0, totalMinutes: 0, avgMinutes: 0, qcVerifiedCount: 0 };
    }
    const totalMinutes = filteredRecords.reduce((acc, r) => acc + (r.durationMinutes || 0), 0);
    const avgMinutes = Math.round(totalMinutes / total);
    const qcVerifiedCount = filteredRecords.filter(
      r => r.checklist && r.checklist.qcSwabClearanceDone
    ).length;

    return { total, totalMinutes, avgMinutes, qcVerifiedCount };
  }, [filteredRecords]);

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor('timestamp', {
          header: 'Waktu',
          cell: info => {
            const dateObj = new Date(info.getValue());
            return (
              <div className="font-mono tabular-nums text-[11px] whitespace-nowrap">
                <div className="text-foreground font-semibold">
                  {dateObj.toLocaleDateString('id-ID', {
                    day: '2-digit',
                    month: 'short',
                    year: '2-digit',
                  })}
                </div>
                <div className="text-muted-foreground text-[10px]">
                  {dateObj.toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            );
          },
        }),
        columnHelper.accessor('machineCode', {
          header: 'Mesin & Tipe',
          cell: info => {
            const record = info.row.original;
            const meta = TYPE_META[record.changeoverType] || {
              label: record.changeoverType,
              colorClass: 'text-muted-foreground',
            };
            return (
              <div className="min-w-[130px]">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono tabular-nums font-bold text-brand text-[11px]">
                    {record.machineCode}
                  </span>
                  <span className="text-foreground font-semibold text-[11px] truncate max-w-[130px]">
                    {record.machineName}
                  </span>
                </div>
                <div className={`text-[10px] font-semibold mt-0.5 ${meta.colorClass}`}>
                  {meta.label}
                </div>
              </div>
            );
          },
        }),
        columnHelper.accessor('toWipName', {
          header: 'Transisi WIP',
          cell: info => {
            const record = info.row.original;
            return (
              <div className="min-w-[170px] space-y-0.5">
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="text-muted-foreground truncate max-w-[90px]">
                    {record.fromWipName || 'Startup'}
                  </span>
                  <ArrowRight className="w-3 h-3 text-brand shrink-0" />
                  <span className="font-semibold text-foreground truncate max-w-[110px]">
                    {record.toWipName}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Op: <span className="text-foreground font-medium">{record.operatorName}</span>
                  {record.targetTankCode && (
                    <span className="font-mono text-ink-indigo"> · {record.targetTankCode}</span>
                  )}
                </div>
              </div>
            );
          },
        }),
        columnHelper.accessor('durationMinutes', {
          header: 'Durasi',
          cell: info => (
            <div className="font-mono tabular-nums font-bold text-brand text-[11px] text-right whitespace-nowrap">
              {info.getValue()} mnt
            </div>
          ),
        }),
        columnHelper.display({
          id: 'qcStatus',
          header: 'Audit QC',
          cell: info => {
            const record = info.row.original;
            const cl = record.checklist || {};
            const checkedCount = [
              cl.lineClearanceDone,
              cl.cleaningSanitationDone,
              cl.toolingMouldSwapped,
              cl.parameterConfigured,
              cl.qcSwabClearanceDone,
            ].filter(Boolean).length;
            const isExpanded = expandedRowId === record.id;

            return (
              <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                <span
                  className={`font-mono tabular-nums text-[11px] font-bold ${
                    cl.qcSwabClearanceDone ? 'text-ink-emerald' : 'text-ink-amber'
                  }`}
                >
                  {checkedCount}/5
                </span>
                <button
                  type="button"
                  onClick={() => setExpandedRowId(isExpanded ? null : record.id)}
                  className="p-1 rounded border border-border bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition"
                  title={isExpanded ? 'Tutup rincian checklist' : 'Lihat rincian checklist'}
                >
                  {isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            );
          },
        }),
      ]),
    [expandedRowId]
  );

  const table = useTable({
    features: changeoverTableFeatures,
    columns,
    data: filteredRecords,
    state: { sorting },
    onSortingChange: setSorting,
  });

  return (
    <SlideOverDrawer
      open={isOpen}
      onOpenChange={open => {
        if (!open) onClose();
      }}
      size="2xl"
      icon={<History className="w-5 h-5" />}
      title="Riwayat & Audit Log Changeover Produk Mesin"
      description="Catatan pergantian formula WIP, sanitasi jalur pipa, clearance alergen, dan verifikasi QC mesin produksi."
      bodyClassName="space-y-4"
      footer={
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground font-mono tabular-nums">
            Menampilkan {filteredRecords.length} dari {consolidatedRecords.length} log changeover
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-muted hover:bg-accent text-foreground border border-border rounded-xl font-semibold transition whitespace-nowrap"
          >
            Tutup Riwayat
          </button>
        </div>
      }
    >
      {/* Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        <div className="bg-background border border-border p-2.5 rounded-xl">
          <span className="text-muted-foreground text-[10px] block">Total Sesi Changeover</span>
          <span className="text-base font-bold text-foreground font-mono tabular-nums">
            {metrics.total} Kali
          </span>
        </div>

        <div className="bg-background border border-border p-2.5 rounded-xl">
          <span className="text-muted-foreground text-[10px] block">Rata-Rata Setup</span>
          <span className="text-base font-bold text-brand font-mono tabular-nums">
            {metrics.avgMinutes} Menit
          </span>
        </div>

        <div className="bg-background border border-border p-2.5 rounded-xl">
          <span className="text-muted-foreground text-[10px] block">Total Downtime</span>
          <span className="text-base font-bold text-ink-amber font-mono tabular-nums">
            {Math.floor(metrics.totalMinutes / 60)}j {metrics.totalMinutes % 60}m
          </span>
        </div>

        <div className="bg-background border border-border p-2.5 rounded-xl">
          <span className="text-muted-foreground text-[10px] block">Lolos QC Swab</span>
          <span className="text-base font-bold text-ink-emerald font-mono tabular-nums">
            {metrics.qcVerifiedCount} / {metrics.total}
          </span>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="flex flex-col sm:flex-row items-center gap-2">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cari kode mesin, nama WIP, operator, QC..."
            className="w-full bg-background border border-border rounded-lg pl-9 pr-8 py-2 text-xs text-foreground placeholder:text-ink-muted focus:outline-none focus:border-accent-primary"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Hapus pencarian"
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="w-full sm:w-auto flex items-center gap-2 shrink-0">
          <select
            value={filterMachineId}
            onChange={e => setFilterMachineId(e.target.value)}
            className="w-full sm:w-44 bg-background border border-border rounded-lg px-2.5 py-2 text-xs text-foreground focus:outline-none focus:border-accent-primary"
          >
            <option value="ALL">Semua Mesin Produksi</option>
            {machines.map(m => (
              <option key={m.id} value={m.id}>
                [{m.code}] {m.name}
              </option>
            ))}
          </select>

          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="w-full sm:w-36 bg-background border border-border rounded-lg px-2.5 py-2 text-xs text-foreground focus:outline-none focus:border-accent-primary"
          >
            <option value="ALL">Semua Tipe</option>
            <option value="MINOR">Minor / Flavour</option>
            <option value="MAJOR_ALLERGEN">Major / Alergen</option>
            <option value="FULL_CIP">Full CIP</option>
            <option value="MOULD_TOOLING">Ganti Tooling</option>
          </select>
        </div>
      </div>

      {/* Audit Table (@tanstack/react-table v9) */}
      {filteredRecords.length === 0 ? (
        <div className="text-center py-12 px-4 bg-background rounded-xl border border-border">
          <History className="w-9 h-9 text-muted-foreground mx-auto mb-2" />
          <h4 className="font-bold text-foreground text-sm mb-1">Belum Ada Riwayat Changeover</h4>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {searchQuery || filterMachineId !== 'ALL' || filterType !== 'ALL'
              ? 'Tidak ada data changeover yang cocok dengan filter pencarian.'
              : 'Gunakan tombol "Changeover Produk" pada kartu mesin untuk mencatat proses pergantian formula pertama.'}
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-background">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                {table.getHeaderGroups().map(headerGroup => (
                  <tr
                    key={headerGroup.id}
                    className="border-b border-border bg-muted text-[11px] font-bold text-foreground"
                  >
                    {headerGroup.headers.map(header => {
                      const canSort = header.column.getCanSort();
                      return (
                        <th
                          key={header.id}
                          className={`py-2.5 px-3 whitespace-nowrap ${
                            header.id === 'durationMinutes' || header.id === 'qcStatus'
                              ? 'text-right'
                              : ''
                          }`}
                        >
                          {canSort ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className="inline-flex items-center gap-1 hover:text-brand transition"
                            >
                              <table.FlexRender header={header} />
                              <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                            </button>
                          ) : (
                            <table.FlexRender header={header} />
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-border/70">
                {table.getRowModel().rows.map(row => {
                  const record = row.original;
                  const cl = record.checklist || {};
                  const isExpanded = expandedRowId === record.id;

                  return (
                    <React.Fragment key={row.id}>
                      <tr className="hover:bg-muted/60 transition">
                        {row.getAllCells().map(cell => (
                          <td key={cell.id} className="py-2.5 px-3 align-top">
                            <table.FlexRender cell={cell} />
                          </td>
                        ))}
                      </tr>
                      {isExpanded && (
                        <tr className="bg-muted/40">
                          <td colSpan={columns.length} className="px-3 py-3 text-[11px]">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <ShieldCheck className="w-3.5 h-3.5 text-ink-emerald shrink-0" />
                                <span>Checklist Verifikasi:</span>
                                {record.qcInspectorName && (
                                  <span>
                                    · Inspektur QC:{' '}
                                    <strong className="text-ink-emerald">
                                      {record.qcInspectorName}
                                    </strong>
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-brand font-mono tabular-nums">
                                <Clock className="w-3 h-3" />
                                <span>{record.durationMinutes} Menit</span>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2 text-[10px] font-medium">
                              {cl.lineClearanceDone && (
                                <span className="text-ink-emerald">✓ Line Clearance</span>
                              )}
                              {cl.cleaningSanitationDone && (
                                <span className="text-ink-emerald">✓ Sanitasi Jalur</span>
                              )}
                              {cl.toolingMouldSwapped && (
                                <span className="text-ink-amber">✓ Tooling Baru</span>
                              )}
                              {cl.parameterConfigured && (
                                <span className="text-brand">✓ Parameter Resep</span>
                              )}
                              {cl.qcSwabClearanceDone && (
                                <span className="text-ink-purple">✓ Swab QC Lolos</span>
                              )}
                            </div>

                            {record.notes && (
                              <p className="mt-2 text-[11px] text-muted-foreground italic border-t border-border/60 pt-1.5">
                                "{record.notes}"
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SlideOverDrawer>
  );
};
