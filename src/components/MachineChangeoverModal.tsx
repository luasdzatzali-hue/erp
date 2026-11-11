import React, { useState, useEffect } from 'react';
import {
  X,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  ShieldCheck,
  Wrench,
  Layers,
  Cylinder,
  ArrowRight,
  Info,
  CheckSquare,
  Square,
  UserCheck,
  FileText
} from 'lucide-react';
import {
  ProductionMachine,
  WIP,
  WipTank,
  ChangeoverType,
  MachineChangeoverChecklist,
  MachineChangeoverRecord
} from '../types';

interface MachineChangeoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  machine: ProductionMachine | null;
  availableWips: WIP[];
  availableTanks: WipTank[];
  onStartChangeover: (
    machineId: string,
    data: {
      toWipId: string;
      toWipName: string;
      fromWipId?: string;
      fromWipName?: string;
      targetTankId?: string;
      targetTankCode?: string;
      changeoverType: ChangeoverType;
      estimatedMinutes: number;
      operatorName: string;
      qcInspectorName?: string;
      checklist: MachineChangeoverChecklist;
      notes?: string;
    }
  ) => void;
  onCompleteChangeover: (machineId: string, record: MachineChangeoverRecord) => void;
  onCancelChangeover: (machineId: string) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

const DEFAULT_CHECKLIST: MachineChangeoverChecklist = {
  lineClearanceDone: true,
  cleaningSanitationDone: true,
  toolingMouldSwapped: false,
  parameterConfigured: true,
  qcSwabClearanceDone: false
};

const CHANGEOVER_PROFILES: Record<
  ChangeoverType,
  { label: string; defaultMinutes: number; desc: string; badgeColor: string; defaultChecklist: MachineChangeoverChecklist }
> = {
  MINOR: {
    label: 'Minor / Pergantian Rasa Senada',
    defaultMinutes: 20,
    desc: 'Varian aroma/warna senada tanpa perpindahan alergen. Dry cleaning / vacuuming hopper & conveyor.',
    badgeColor: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
    defaultChecklist: {
      lineClearanceDone: true,
      cleaningSanitationDone: true,
      toolingMouldSwapped: false,
      parameterConfigured: true,
      qcSwabClearanceDone: true
    }
  },
  MAJOR_ALLERGEN: {
    label: 'Major / Pergantian Alergen & Warna Kontras',
    defaultMinutes: 60,
    desc: 'Pergantian formula mengandung susu, gluten, atau kacang. Wajib wet washdown, flushing pipa, & swab test QC.',
    badgeColor: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
    defaultChecklist: {
      lineClearanceDone: true,
      cleaningSanitationDone: true,
      toolingMouldSwapped: true,
      parameterConfigured: true,
      qcSwabClearanceDone: false // Wajib swab dulu sebelum start
    }
  },
  FULL_CIP: {
    label: 'Full Sanitasi & CIP Kimiawi',
    defaultMinutes: 75,
    desc: 'Siklus CIP sirkulasi panas & larutan alkali/asam untuk pipa transfer dan ruang mixing vessel.',
    badgeColor: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
    defaultChecklist: {
      lineClearanceDone: true,
      cleaningSanitationDone: true,
      toolingMouldSwapped: false,
      parameterConfigured: true,
      qcSwabClearanceDone: true
    }
  },
  MOULD_TOOLING: {
    label: 'Pergantian Tooling / Cetakan / Nozzle',
    defaultMinutes: 45,
    desc: 'Penggantian part mekanikal (dies, forming roll, nozzle depositor) disesuaikan dengan dimensi produk baru.',
    badgeColor: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    defaultChecklist: {
      lineClearanceDone: true,
      cleaningSanitationDone: true,
      toolingMouldSwapped: true,
      parameterConfigured: true,
      qcSwabClearanceDone: true
    }
  }
};

export const MachineChangeoverModal: React.FC<MachineChangeoverModalProps> = ({
  isOpen,
  onClose,
  machine,
  availableWips,
  availableTanks,
  onStartChangeover,
  onCompleteChangeover,
  onCancelChangeover,
  showToast
}) => {
  // Form states
  const [fromWipId, setFromWipId] = useState<string>('');
  const [toWipId, setToWipId] = useState<string>('');
  const [targetTankId, setTargetTankId] = useState<string>('');
  const [changeoverType, setChangeoverType] = useState<ChangeoverType>('MINOR');
  const [durationMinutes, setDurationMinutes] = useState<number>(20);
  const [operatorName, setOperatorName] = useState<string>('');
  const [qcInspectorName, setQcInspectorName] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [checklist, setChecklist] = useState<MachineChangeoverChecklist>(DEFAULT_CHECKLIST);

  // Sync state when modal opens or machine changes
  useEffect(() => {
    if (!machine || !isOpen) return;

    if (machine.activeChangeover) {
      // Machine is already in CHANGEOVER status: restore active changeover state
      const ac = machine.activeChangeover;
      setFromWipId(ac.fromWipId || '');
      setToWipId(ac.toWipId);
      setTargetTankId(ac.targetTankId || '');
      setChangeoverType(ac.changeoverType);
      setDurationMinutes(ac.estimatedMinutes || 20);
      setOperatorName(ac.operatorName || machine.operatorAssigned || '');
      setQcInspectorName(ac.qcInspectorName || '');
      setNotes(ac.notes || '');
      setChecklist(ac.checklist || DEFAULT_CHECKLIST);
    } else {
      // Setup initial fresh form
      const curWip = machine.currentWipId
        ? machine.currentWipId
        : availableWips.find(w => w.assignedMachineId === machine.id)?.id || '';
      setFromWipId(curWip);

      // Pick first WIP that is different from current WIP, if possible
      const altWip = availableWips.find(w => w.id !== curWip) || availableWips[0];
      const initialTargetWipId = altWip ? altWip.id : '';
      setToWipId(initialTargetWipId);

      // Auto-assign connected tank from WIP if any
      if (altWip && altWip.targetTankId) {
        setTargetTankId(altWip.targetTankId);
      } else {
        const foundTank = availableTanks.find(t =>
          (t.assignedMachineIds && t.assignedMachineIds.includes(machine.id)) ||
          t.assignedMachineId === machine.id
        );
        setTargetTankId(foundTank ? foundTank.id : '');
      }

      setChangeoverType('MINOR');
      setDurationMinutes(CHANGEOVER_PROFILES.MINOR.defaultMinutes);
      setChecklist(CHANGEOVER_PROFILES.MINOR.defaultChecklist);
      setOperatorName(machine.operatorAssigned || '');
      setQcInspectorName('QA Lab On-Duty');
      setNotes('');
    }
  }, [machine, isOpen, availableWips, availableTanks]);

  if (!isOpen || !machine) return null;

  const isAlreadyChanging = machine.status === 'CHANGEOVER' && !!machine.activeChangeover;

  const currentWipObj = availableWips.find(w => w.id === fromWipId);
  const targetWipObj = availableWips.find(w => w.id === toWipId);
  const selectedTankObj = availableTanks.find(t => t.id === targetTankId);

  // When changing WIP target, auto-suggest target tank
  const handleTargetWipChange = (wId: string) => {
    setToWipId(wId);
    const selectedW = availableWips.find(w => w.id === wId);
    if (selectedW?.targetTankId) {
      setTargetTankId(selectedW.targetTankId);
    }
  };

  // When changing changeover type, update default duration & checklist recommendation
  const handleTypeChange = (type: ChangeoverType) => {
    setChangeoverType(type);
    setDurationMinutes(CHANGEOVER_PROFILES[type].defaultMinutes);
    if (!isAlreadyChanging) {
      setChecklist(CHANGEOVER_PROFILES[type].defaultChecklist);
    }
  };

  const toggleChecklist = (key: keyof MachineChangeoverChecklist) => {
    setChecklist(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const setAllChecklist = (val: boolean) => {
    setChecklist({
      lineClearanceDone: val,
      cleaningSanitationDone: val,
      toolingMouldSwapped: val,
      parameterConfigured: val,
      qcSwabClearanceDone: val
    });
  };

  const isChecklistComplete =
    checklist.lineClearanceDone &&
    checklist.cleaningSanitationDone &&
    checklist.parameterConfigured &&
    checklist.qcSwabClearanceDone;

  // Action: Start Changeover (Put machine in CHANGEOVER status)
  const handleStart = () => {
    if (!toWipId) {
      showToast('Pilih produk target WIP baru terlebih dahulu', true);
      return;
    }
    if (toWipId === fromWipId) {
      const confirmSame = window.confirm(
        'Produk target sama dengan produk saat ini. Apakah Anda yakin ingin melakukan re-changeover / flushing sanitasi untuk formula yang sama?'
      );
      if (!confirmSame) return;
    }

    onStartChangeover(machine.id, {
      toWipId,
      toWipName: targetWipObj?.name || 'WIP Baru',
      fromWipId: fromWipId || undefined,
      fromWipName: currentWipObj?.name || undefined,
      targetTankId: targetTankId || undefined,
      targetTankCode: selectedTankObj?.code || undefined,
      changeoverType,
      estimatedMinutes: durationMinutes,
      operatorName: operatorName.trim() || 'Operator Line',
      qcInspectorName: qcInspectorName.trim() || undefined,
      checklist,
      notes: notes.trim() || undefined
    });

    showToast(
      `Proses changeover produk untuk ${machine.code} (${machine.name}) dimulai. Status mesin: CHANGEOVER.`
    );
    onClose();
  };

  // Action: Complete and verify changeover
  const handleComplete = () => {
    if (!toWipId) {
      showToast('Pilih produk target WIP baru terlebih dahulu', true);
      return;
    }

    if (!isChecklistComplete) {
      const confirmIncomplete = window.confirm(
        'Perhatian: Ada poin checklist clearance / verifikasi QC yang belum dicentang. Tetap selesaikan dan sahkan mesin beroperasi?'
      );
      if (!confirmIncomplete) return;
    }

    const now = new Date().toISOString();
    const startedAt = machine.activeChangeover?.startedAt || now;

    const record: MachineChangeoverRecord = {
      id: `co_${Date.now()}`,
      machineId: machine.id,
      machineCode: machine.code,
      machineName: machine.name,
      timestamp: now,
      fromWipId: fromWipId || undefined,
      fromWipName: currentWipObj?.name || undefined,
      toWipId,
      toWipName: targetWipObj?.name || 'WIP Baru',
      targetTankId: targetTankId || undefined,
      targetTankCode: selectedTankObj?.code || undefined,
      changeoverType,
      durationMinutes: durationMinutes || 20,
      operatorName: operatorName.trim() || 'Operator PIC',
      qcInspectorName: qcInspectorName.trim() || 'QC Verified',
      checklist,
      notes: notes.trim() || undefined,
      status: 'COMPLETED',
      startedAt,
      completedAt: now
    };

    onCompleteChangeover(machine.id, record);
    showToast(
      `Changeover selesai! Mesin ${machine.code} sekarang aktif memproduksi ${targetWipObj?.name || 'produk baru'} (OPERATIONAL).`
    );
    onClose();
  };

  // Action: Cancel changeover
  const handleCancel = () => {
    const confirmCancel = window.confirm(
      `Batalkan proses changeover mesin ${machine.code}? Status mesin akan dikembalikan ke OPERATIONAL / STANDBY.`
    );
    if (!confirmCancel) return;

    onCancelChangeover(machine.id);
    showToast(`Proses changeover mesin ${machine.code} telah dibatalkan.`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40">
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-2xl ${
              isAlreadyChanging
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
            }`}>
              <RotateCw className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-xs font-bold text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800">
                  {machine.code}
                </span>
                <h3 className="font-bold text-sm sm:text-base text-white">
                  Opsi Changeover Produk Mesin
                </h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                  machine.status === 'CHANGEOVER'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                    : machine.status === 'OPERATIONAL'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-300'
                }`}>
                  {machine.status === 'CHANGEOVER' ? 'Sedang Changeover' : machine.status}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {machine.name} • {machine.line} (Kapasitas: {machine.capacityKgPerHour} kg/jam)
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

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-slate-300">
          {/* Active Changeover In-Progress Alert */}
          {isAlreadyChanging && (
            <div className="bg-gradient-to-r from-amber-950/60 via-slate-900 to-amber-950/40 border border-amber-500/40 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-300 shadow-xl">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 animate-spin">
                  <RotateCw className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-xs sm:text-sm flex items-center space-x-2">
                    <span>Sedang Dalam Proses Changeover Aktif</span>
                  </h4>
                  <p className="text-[11px] text-amber-200/90 mt-0.5">
                    Mesin sedang dialihkan dari <strong>{machine.activeChangeover?.fromWipName || 'WIP Sebelumnya'}</strong> &rarr; <strong>{machine.activeChangeover?.toWipName}</strong>. Dimulai: {new Date(machine.activeChangeover?.startedAt || '').toLocaleTimeString()} WIB ({machine.activeChangeover?.estimatedMinutes} menit).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancel}
                className="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-700/60 text-rose-300 rounded-xl text-xs font-semibold transition shrink-0"
              >
                Batalkan Changeover
              </button>
            </div>
          )}

          {/* Section 1: Alur Pergantian Produk (From -> To) */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-white flex items-center space-x-2">
                <ArrowRight className="w-4 h-4 text-cyan-400" />
                <span>1. Pemilihan Alur Formula Produk (WIP)</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Mesin &rarr; Output Penampung</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Dari WIP Saat Ini */}
              <div className="space-y-1.5">
                <label className="block text-slate-400 font-medium text-[11px]">
                  Produk / WIP Asal (Sebelumnya)
                </label>
                <select
                  value={fromWipId}
                  onChange={(e) => setFromWipId(e.target.value)}
                  disabled={isAlreadyChanging}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500 disabled:opacity-60"
                >
                  <option value="">-- Tanpa Produk Asal (Mesin Baru / Kosong) --</option>
                  {availableWips.map((wip) => (
                    <option key={wip.id} value={wip.id}>
                      {wip.code ? `[${wip.code}] ` : ''}{wip.name} ({wip.batchWeightKg} kg/batch)
                    </option>
                  ))}
                </select>
                {currentWipObj && (
                  <div className="text-[10px] text-slate-400 bg-slate-900/60 p-2 rounded-lg border border-slate-850 flex items-center justify-between">
                    <span>Formula Terpasang:</span>
                    <span className="font-mono text-cyan-300 font-medium">{currentWipObj.name}</span>
                  </div>
                )}
              </div>

              {/* Menuju Target WIP Baru */}
              <div className="space-y-1.5">
                <label className="block text-cyan-400 font-bold text-[11px] flex items-center space-x-1">
                  <span>Target Produk / WIP Baru *</span>
                  <span className="text-[10px] text-slate-400 font-normal">(Formula Tujuan)</span>
                </label>
                <select
                  value={toWipId}
                  onChange={(e) => handleTargetWipChange(e.target.value)}
                  disabled={isAlreadyChanging}
                  className="w-full bg-slate-900 border border-cyan-500/50 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400 font-semibold disabled:opacity-60"
                >
                  <option value="">-- Pilih Target Formula WIP --</option>
                  {availableWips.map((wip) => (
                    <option key={wip.id} value={wip.id}>
                      {wip.code ? `[${wip.code}] ` : ''}{wip.name} ({wip.batchWeightKg} kg/batch)
                    </option>
                  ))}
                </select>
                {targetWipObj && (
                  <div className="text-[10px] text-slate-400 bg-cyan-950/40 p-2 rounded-lg border border-cyan-800/40 flex items-center justify-between">
                    <span>Bobot 1 Batch WIP:</span>
                    <span className="font-mono text-cyan-300 font-bold">{targetWipObj.batchWeightKg.toFixed(2)} kg</span>
                  </div>
                )}
              </div>
            </div>

            {/* Target Tank WIP Output */}
            <div className="pt-2 border-t border-slate-850 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2 text-[11px] text-slate-400">
                <Cylinder className="w-3.5 h-3.5 text-indigo-400" />
                <span>Tangki Penampung Output WIP (Holding / Storage Tank):</span>
              </div>
              <select
                value={targetTankId}
                onChange={(e) => setTargetTankId(e.target.value)}
                disabled={isAlreadyChanging}
                className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white text-[11px] focus:outline-none focus:border-indigo-400 disabled:opacity-60"
              >
                <option value="">-- Tanpa Tangki Khusus (Direct Line) --</option>
                {availableTanks.map((tank) => (
                  <option key={tank.id} value={tank.id}>
                    [{tank.code}] {tank.name} ({tank.type === 'HOLDING_TANK' ? 'Holding' : 'Storage'} - {tank.capacityKg} kg)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Section 2: Klasifikasi Tipe Changeover & Matriks Sanitasi */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>2. Klasifikasi Tipe Changeover & Matriks Sanitasi</span>
              </span>
              <span className="text-[10px] text-slate-400">Pilih protokol sesuai resiko alergen & formula</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(Object.keys(CHANGEOVER_PROFILES) as ChangeoverType[]).map((typeKey) => {
                const profile = CHANGEOVER_PROFILES[typeKey];
                const isSelected = changeoverType === typeKey;

                return (
                  <div
                    key={typeKey}
                    onClick={() => !isAlreadyChanging && handleTypeChange(typeKey)}
                    className={`p-3 rounded-2xl border transition text-left cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-slate-850 border-cyan-500 shadow-md shadow-cyan-950'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                    } ${isAlreadyChanging ? 'cursor-default opacity-80' : ''}`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-white text-xs">{profile.label}</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${profile.badgeColor}`}>
                          ~{profile.defaultMinutes} mnt
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {profile.desc}
                      </p>
                    </div>
                    <div className="pt-2 mt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                      <span className="text-slate-500">Standar GMP</span>
                      <span className={`font-semibold ${isSelected ? 'text-cyan-400' : 'text-slate-500'}`}>
                        {isSelected ? '✓ Terpilih' : 'Pilih'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Estimasi Durasi & Timer */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-white block">Estimasi Durasi Changeover (Menit)</span>
                <span className="text-[11px] text-slate-400">
                  Target waktu henti operasional (downtime terencana) untuk setup formula baru
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="number"
                min="5"
                max="360"
                step="5"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 20)}
                disabled={isAlreadyChanging}
                className="w-24 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-center text-cyan-400 font-mono font-bold text-sm focus:outline-none focus:border-cyan-400 disabled:opacity-60"
              />
              <span className="text-slate-400 text-xs font-semibold">Menit</span>
            </div>
          </div>

          {/* Section 4: Checklist Standard Line Clearance & Sanitasi */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-white">4. Checklist Line Clearance & Verifikasi Sanitasi</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setAllChecklist(true)}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 underline font-medium"
                >
                  Tandai Semua Selesai
                </button>
                <span className="text-slate-600">•</span>
                <button
                  type="button"
                  onClick={() => setAllChecklist(false)}
                  className="text-[10px] text-slate-400 hover:text-white underline font-medium"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {/* Item 1 */}
              <div
                onClick={() => toggleChecklist('lineClearanceDone')}
                className={`p-2.5 rounded-xl border flex items-start space-x-3 cursor-pointer transition ${
                  checklist.lineClearanceDone
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-white'
                    : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {checklist.lineClearanceDone ? (
                    <CheckSquare className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-500" />
                  )}
                </div>
                <div>
                  <span className="font-semibold block text-xs">
                    1. Line Clearance & Pengosongan Sisa Material Sebelumnya
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Semua sisa adonan, remah, bahan kemasan lama, dan sisa batch formula lama sudah dikeluarkan dari hopper mesin.
                  </span>
                </div>
              </div>

              {/* Item 2 */}
              <div
                onClick={() => toggleChecklist('cleaningSanitationDone')}
                className={`p-2.5 rounded-xl border flex items-start space-x-3 cursor-pointer transition ${
                  checklist.cleaningSanitationDone
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-white'
                    : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {checklist.cleaningSanitationDone ? (
                    <CheckSquare className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-500" />
                  )}
                </div>
                <div>
                  <span className="font-semibold block text-xs">
                    2. Pembersihan Fisik / Flushing Sanitasi Jalur Pipa Transfer
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Proses cuci basah (washdown), vacuuming, atau sirkulasi flushing air sanitasi pada vessel & pipa menuju tangki selesai.
                  </span>
                </div>
              </div>

              {/* Item 3 */}
              <div
                onClick={() => toggleChecklist('toolingMouldSwapped')}
                className={`p-2.5 rounded-xl border flex items-start space-x-3 cursor-pointer transition ${
                  checklist.toolingMouldSwapped
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-white'
                    : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {checklist.toolingMouldSwapped ? (
                    <CheckSquare className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-500" />
                  )}
                </div>
                <div>
                  <span className="font-semibold block text-xs">
                    3. Penggantian / Penyesuaian Tooling, Cetakan, & Nozzle Dosing
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Dies, mata pisau, mould biskuit, atau nozzle depositor terpasang kencang sesuai spesifikasi bentuk SKU/WIP target.
                  </span>
                </div>
              </div>

              {/* Item 4 */}
              <div
                onClick={() => toggleChecklist('parameterConfigured')}
                className={`p-2.5 rounded-xl border flex items-start space-x-3 cursor-pointer transition ${
                  checklist.parameterConfigured
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-white'
                    : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {checklist.parameterConfigured ? (
                    <CheckSquare className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-500" />
                  )}
                </div>
                <div>
                  <span className="font-semibold block text-xs">
                    4. Konfigurasi Parameter Mesin (Suhu, Speed Mixer, Tekanan)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Setting temperatur heater/cooling jacket, rpm pengaduk, dan timer siklus batching telah disesuaikan dengan resep.
                  </span>
                </div>
              </div>

              {/* Item 5 */}
              <div
                onClick={() => toggleChecklist('qcSwabClearanceDone')}
                className={`p-2.5 rounded-xl border flex items-start space-x-3 cursor-pointer transition ${
                  checklist.qcSwabClearanceDone
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-white'
                    : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {checklist.qcSwabClearanceDone ? (
                    <CheckSquare className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-500" />
                  )}
                </div>
                <div>
                  <span className="font-semibold block text-xs">
                    5. Inspeksi Visual Kebersihan & Swab Test Alergen / QC Clearance
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Inspeksi visual bebas residu asing, dan verifikasi kelayakan higienitas oleh petugas Quality Control (QC).
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 5: Operator, QC & Catatan Teknis */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
            <div>
              <label className="block text-slate-400 font-medium text-[11px] mb-1 flex items-center space-x-1">
                <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
                <span>Teknisi / Operator Pelaksana *</span>
              </label>
              <input
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="e.g. Supriyadi (Shift 1)"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-medium text-[11px] mb-1 flex items-center space-x-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Inspektur QC / QA Verifikator</span>
              </label>
              <input
                type="text"
                value={qcInspectorName}
                onChange={(e) => setQcInspectorName(e.target.value)}
                placeholder="e.g. Siti Rahayu (QC On-Duty)"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-400 font-medium text-[11px] mb-1 flex items-center space-x-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>Catatan Teknis / Kondisi Mesin Saat Changeover</span>
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Suhu jacket awal 45°C stabil, seal nozzle diganti baru, siap transfer ke HT-01"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2 text-[11px] text-slate-400">
            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>
              Perubahan produk akan mencatat log downtime & memperbarui produk aktif mesin.
            </span>
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition"
            >
              Tutup
            </button>

            {isAlreadyChanging ? (
              <button
                type="button"
                onClick={handleComplete}
                className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition active:scale-95 flex items-center space-x-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Selesaikan & Sahkan Produksi</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleStart}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl shadow-md shadow-amber-600/20 transition active:scale-95 flex items-center space-x-1.5"
                >
                  <RotateCw className="w-4 h-4" />
                  <span>Mulai Changeover</span>
                </button>

                <button
                  type="button"
                  onClick={handleComplete}
                  className="px-5 py-2 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-600/20 transition active:scale-95 flex items-center space-x-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Eksekusi & Selesaikan Langsung</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
