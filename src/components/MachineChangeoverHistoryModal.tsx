import React, { useState, useMemo } from 'react';
import {
  X,
  History,
  RotateCw,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Calendar,
  Layers,
  Cylinder,
  FileText
} from 'lucide-react';
import {
  ProductionMachine,
  MachineChangeoverRecord,
  ChangeoverType
} from '../types';

interface MachineChangeoverHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  machines: ProductionMachine[];
  selectedMachineId?: string | null;
  allChangeovers: MachineChangeoverRecord[];
}

export const MachineChangeoverHistoryModal: React.FC<MachineChangeoverHistoryModalProps> = ({
  isOpen,
  onClose,
  machines,
  selectedMachineId: initialSelectedMachineId = null,
  allChangeovers
}) => {
  const [filterMachineId, setFilterMachineId] = useState<string>(initialSelectedMachineId || 'ALL');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Sync initial machine id when opened
  React.useEffect(() => {
    if (isOpen) {
      setFilterMachineId(initialSelectedMachineId || 'ALL');
    }
  }, [isOpen, initialSelectedMachineId]);

  // Aggregate list of records from either allChangeovers or machine's changeoverHistory
  const consolidatedRecords = useMemo(() => {
    const listMap = new Map<string, MachineChangeoverRecord>();

    // From global records
    (allChangeovers || []).forEach(r => listMap.set(r.id, r));

    // Also pull from machine histories to ensure nothing is missed
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

  // Filtered records
  const filteredRecords = useMemo(() => {
    return consolidatedRecords.filter(r => {
      if (filterMachineId !== 'ALL' && r.machineId !== filterMachineId) return false;
      if (filterType !== 'ALL' && r.changeoverType !== filterType) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCode = r.machineCode.toLowerCase().includes(q);
        const matchName = r.machineName.toLowerCase().includes(q);
        const matchTo = r.toWipName.toLowerCase().includes(q);
        const matchFrom = (r.fromWipName || '').toLowerCase().includes(q);
        const matchOp = r.operatorName.toLowerCase().includes(q);
        const matchQc = (r.qcInspectorName || '').toLowerCase().includes(q);
        const matchNotes = (r.notes || '').toLowerCase().includes(q);
        return matchCode || matchName || matchTo || matchFrom || matchOp || matchQc || matchNotes;
      }
      return true;
    });
  }, [consolidatedRecords, filterMachineId, filterType, searchQuery]);

  // Summary Metrics
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

  if (!isOpen) return null;

  const getTypeBadge = (type: ChangeoverType) => {
    switch (type) {
      case 'MINOR':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
            Minor (Flavour Swap)
          </span>
        );
      case 'MAJOR_ALLERGEN':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/30">
            Major / Alergen
          </span>
        );
      case 'FULL_CIP':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30">
            Full CIP & Sanitasi
          </span>
        );
      case 'MOULD_TOOLING':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
            Ganti Tooling / Mould
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
            {type}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white flex items-center space-x-2">
                <span>Riwayat & Audit Log Changeover Produk Mesin</span>
              </h3>
              <p className="text-xs text-slate-400">
                Catatan pergantian formula WIP, sanitasi jalur pipa, clearance alergen, dan verifikasi QC mesin produksi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter & Metric Bar */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/50 space-y-3">
          {/* Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Total Sesi Changeover:</span>
              <span className="text-base font-bold text-white font-mono">{metrics.total} Kali</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Rata-Rata Waktu Setup:</span>
              <span className="text-base font-bold text-cyan-400 font-mono">{metrics.avgMinutes} Menit</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Total Waktu Downtime:</span>
              <span className="text-base font-bold text-amber-400 font-mono">
                {Math.floor(metrics.totalMinutes / 60)}j {metrics.totalMinutes % 60}m
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Verifikasi QC Clearance:</span>
              <span className="text-base font-bold text-emerald-400 font-mono">
                {metrics.qcVerifiedCount} / {metrics.total} Lolos
              </span>
            </div>
          </div>

          {/* Filter Controls */}
          <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari kode mesin, nama WIP, operator, QC..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-500 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter by Machine */}
            <div className="w-full sm:w-auto flex items-center space-x-1.5 shrink-0">
              <select
                value={filterMachineId}
                onChange={(e) => setFilterMachineId(e.target.value)}
                className="w-full sm:w-48 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">Semua Mesin Produksi</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    [{m.code}] {m.name}
                  </option>
                ))}
              </select>

              {/* Filter by Type */}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full sm:w-40 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">Semua Tipe</option>
                <option value="MINOR">Minor / Flavour</option>
                <option value="MAJOR_ALLERGEN">Major / Alergen</option>
                <option value="FULL_CIP">Full CIP</option>
                <option value="MOULD_TOOLING">Ganti Tooling</option>
              </select>
            </div>
          </div>
        </div>

        {/* Record List */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1 text-xs">
          {filteredRecords.length === 0 ? (
            <div className="text-center py-12 px-4 bg-slate-950/40 rounded-2xl border border-slate-800/80">
              <History className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <h4 className="font-bold text-white text-sm mb-1">Belum Ada Riwayat Changeover</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {searchQuery || filterMachineId !== 'ALL' || filterType !== 'ALL'
                  ? 'Tidak ada data changeover yang cocok dengan filter pencarian.'
                  : 'Gunakan tombol "Changeover Produk" pada kartu mesin untuk mencatat proses pergantian formula pertama.'}
              </p>
            </div>
          ) : (
            filteredRecords.map((record) => {
              const checklistItems = record.checklist || {};
              const checkedCount = [
                checklistItems.lineClearanceDone,
                checklistItems.cleaningSanitationDone,
                checklistItems.toolingMouldSwapped,
                checklistItems.parameterConfigured,
                checklistItems.qcSwabClearanceDone
              ].filter(Boolean).length;

              const dateObj = new Date(record.timestamp);
              const formattedDate = dateObj.toLocaleDateString('id-ID', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              });
              const formattedTime = dateObj.toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <div
                  key={record.id}
                  className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3 hover:border-slate-700 transition shadow-md"
                >
                  {/* Top Bar: Mesin, Tipe, & Timestamp */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-800 gap-2">
                    <div className="flex items-center space-x-2.5">
                      <span className="font-mono text-xs font-bold text-cyan-400 bg-cyan-950/60 px-2.5 py-0.5 rounded border border-cyan-800">
                        {record.machineCode}
                      </span>
                      <div>
                        <span className="font-bold text-white text-xs sm:text-sm">{record.machineName}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {getTypeBadge(record.changeoverType)}
                      <span className="text-[10px] text-slate-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                        {formattedDate} • {formattedTime}
                      </span>
                    </div>
                  </div>

                  {/* Alur Produk From -> To */}
                  <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-850 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center space-x-2 truncate">
                      <div className="truncate">
                        <span className="text-[10px] text-slate-500 block uppercase font-semibold">Produk Asal:</span>
                        <span className="text-slate-300 font-medium truncate block">
                          {record.fromWipName || '(Mesin Kosong / Startup)'}
                        </span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-cyan-400 shrink-0 mx-2" />
                      <div className="truncate">
                        <span className="text-[10px] text-cyan-400 block uppercase font-bold">Produk Baru:</span>
                        <span className="text-white font-bold truncate block">
                          {record.toWipName}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 shrink-0 self-end sm:self-auto">
                      {record.targetTankCode && (
                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 block">Tangki Tujuan:</span>
                          <span className="font-mono text-indigo-400 text-xs font-bold">
                            {record.targetTankCode}
                          </span>
                        </div>
                      )}

                      <div className="text-right border-l border-slate-800 pl-3">
                        <span className="text-[10px] text-slate-500 block">Durasi Setup:</span>
                        <span className="font-mono text-cyan-400 font-bold text-xs flex items-center space-x-1 justify-end">
                          <Clock className="w-3 h-3" />
                          <span>{record.durationMinutes} Menit</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Checklist & Operator Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-1.5 text-slate-400">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Checklist Clearance & Verifikasi:</span>
                        <span className="font-mono text-emerald-400 font-bold">
                          {checkedCount} / 5 Terpenuhi
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 text-[10px]">
                        {checklistItems.lineClearanceDone && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            ✓ Line Clearance
                          </span>
                        )}
                        {checklistItems.cleaningSanitationDone && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            ✓ Sanitasi Jalur
                          </span>
                        )}
                        {checklistItems.toolingMouldSwapped && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            ✓ Tooling Baru
                          </span>
                        )}
                        {checklistItems.parameterConfigured && (
                          <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            ✓ Parameter Resep
                          </span>
                        )}
                        {checklistItems.qcSwabClearanceDone && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            ✓ Swab QC Lolos
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1 sm:text-right">
                      <div className="text-slate-400">
                        Operator: <strong className="text-white">{record.operatorName}</strong>
                        {record.qcInspectorName && (
                          <> • QC: <strong className="text-emerald-400">{record.qcInspectorName}</strong></>
                        )}
                      </div>
                      {record.notes && (
                        <div className="text-[10px] text-slate-400 italic">
                          "{record.notes}"
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition"
          >
            Tutup Riwayat
          </button>
        </div>
      </div>
    </div>
  );
};
