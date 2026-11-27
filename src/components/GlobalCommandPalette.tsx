import React, { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import {
  Search,
  LayoutDashboard,
  CalendarRange,
  Database,
  FileText,
  Truck,
  Layers,
  Cylinder,
  Calculator,
  ClipboardList,
  FileSpreadsheet,
  Droplet,
  Printer,
  Sun,
  Moon,
  SlidersHorizontal,
  UserCheck,
  Users,
  Factory,
  Home,
  X,
  ArrowRight
} from 'lucide-react';
import { AppState, ProductionLine } from '../types';
import { resolveEffectiveRole } from '../utils/roleAccess';

interface GlobalCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: AppState;
  theme: 'midnight' | 'daylight';
  onSwitchTab: (tab: AppState['currentTab']) => void;
  onToggleTheme: () => void;
  onOpenTankModal: () => void;
  onOpenPdfModal: () => void;
  onOpenStockAdjustment: (materialId?: string) => void;
  onOpenRoleSwitcher: () => void;
  onOpenUserManagement?: () => void;
  onSelectTank: (tankId: string) => void;
  onSelectLine: (lineId: string) => void;
}

const DEFAULT_FALLBACK_LINES: ProductionLine[] = [
  { id: 'line_a', code: 'LINE-A', name: 'Line A', description: 'Jalur Produksi Utama A', isActive: true },
  { id: 'line_b', code: 'LINE-B', name: 'Line B', description: 'Jalur Produksi B', isActive: true },
  { id: 'line_c', code: 'LINE-C', name: 'Line C', description: 'Jalur Produksi C', isActive: true },
  { id: 'line_d', code: 'LINE-D', name: 'Line D', description: 'Jalur Produksi D', isActive: true }
];

export const GlobalCommandPalette: React.FC<GlobalCommandPaletteProps> = ({
  open,
  onOpenChange,
  state,
  theme,
  onSwitchTab,
  onToggleTheme,
  onOpenTankModal,
  onOpenPdfModal,
  onOpenStockAdjustment,
  onOpenRoleSwitcher,
  onOpenUserManagement,
  onSelectTank,
  onSelectLine
}) => {
  const [search, setSearch] = useState('');
  const effectiveRole = resolveEffectiveRole(state);
  const isAdmin = effectiveRole.isAdmin;
  const isManagement = effectiveRole.isManagement;

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const runAndClose = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  // Category 1: Modul Operasional 7 Tahap (disesuaikan izin role pengguna)
  const stageModules: {
    step: string;
    tab: AppState['currentTab'];
    label: string;
    subtitle: string;
    keywords: string;
    icon: React.ComponentType<{ className?: string }>;
    visible: boolean;
  }[] = [
    {
      step: '01',
      tab: 'master',
      label: 'Tahap 01 · Master BOM, Resep & Mesin',
      subtitle: `${state.master.skus.length} SKU · ${state.master.materials.length} Material`,
      keywords: 'tahap 01 master bom sku wip resep material mesin tangki konfigurasi',
      icon: Database,
      visible: isAdmin
    },
    {
      step: '02',
      tab: 'weekly-planning',
      label: 'Tahap 02 · Weekly Planning Produksi',
      subtitle: 'Jadwal & target output mingguan',
      keywords: 'tahap 02 weekly planning mingguan jadwal target shift',
      icon: CalendarRange,
      visible: true
    },
    {
      step: '03',
      tab: 'permintaan',
      label: 'Tahap 03 · Permintaan Material (Slip Order)',
      subtitle: `${state.transactions.requests.filter(r => r.status !== 'Received').length} menunggu`,
      keywords: 'tahap 03 permintaan material request slip order bon gdrm',
      icon: FileText,
      visible: !isManagement
    },
    {
      step: '04',
      tab: 'penerimaan',
      label: 'Tahap 04 · Penerimaan Fisik Material',
      subtitle: `${state.transactions.receipts.length} catatan kedatangan`,
      keywords: 'tahap 04 penerimaan terima receipt kedatangan timbangan zak lot',
      icon: Truck,
      visible: !isManagement
    },
    {
      step: '05',
      tab: 'pemakaian',
      label: 'Tahap 05 · Work Order WIP & Batch Mesin',
      subtitle: `${(state.transactions.wipBatches || []).filter(b => b.status === 'SEDANG_PRODUKSI' || b.status === 'DIJEDA').length} batch aktif`,
      keywords: 'tahap 05 work order wip batch mesin pemakaian fifo gantt',
      icon: Layers,
      visible: !isManagement
    },
    {
      step: '06',
      tab: 'tank-monitoring',
      label: 'Tahap 06 · Monitoring & Diagram P&ID Tangki WIP',
      subtitle: `${state.master.tanks.length} tangki terpantau`,
      keywords: 'tahap 06 tangki wip scada holding storage transfer level pid',
      icon: Cylinder,
      visible: true
    },
    {
      step: '07',
      tab: 'dashboard',
      label: 'Tahap 07 · Manufacturing Control Room',
      subtitle: 'Kontrol lini produksi & output karton',
      keywords: 'tahap 07 dashboard manufacturing control room lini produksi oee karton',
      icon: LayoutDashboard,
      visible: true
    }
  ];

  // Production Lines (fallback ke 4 lini standar bila belum dikonfigurasi)
  const productionLines = useMemo(() => {
    const active = (state.master.productionLines || []).filter(l => l.isActive);
    return active.length > 0 ? active : DEFAULT_FALLBACK_LINES;
  }, [state.master.productionLines]);

  const runningRuns = useMemo(() => {
    const runs = state.activeSkuRuns || (state.activeSkuRun ? [state.activeSkuRun] : []);
    return runs.filter(r => r.isRunning);
  }, [state.activeSkuRuns, state.activeSkuRun]);

  const groupHeadingClass =
    '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-muted';

  const itemClass =
    'flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-xs text-ink-primary cursor-pointer transition-colors aria-selected:bg-elevated aria-selected:text-ink-primary data-[selected=true]:bg-elevated hover:bg-elevated/70';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[10vh] z-50 w-[94vw] max-w-2xl -translate-x-1/2 rounded-xl border border-border-strong bg-surface text-ink-primary shadow-2xl overflow-hidden focus:outline-none"
        >
          <Dialog.Title className="sr-only">
            Global Command Palette ProdTrack MES
          </Dialog.Title>

          <Command label="Global Command Palette" className="flex flex-col w-full">
            {/* Auto-Focused Search Header */}
            <div className="flex items-center gap-2.5 px-3.5 h-11 border-b border-border-subtle bg-surface-header">
              <Search className="w-4 h-4 text-accent-primary shrink-0" />
              <Command.Input
                autoFocus
                value={search}
                onValueChange={setSearch}
                placeholder="Cari modul 7 tahap, laporan, tangki WIP (HT-01 / ST-01), atau lini produksi..."
                className="flex-1 bg-transparent text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none"
              />
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Tutup Command Palette"
                className="p-1 rounded-md text-ink-secondary hover:text-ink-primary hover:bg-elevated transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Grouped Results */}
            <Command.List className="max-h-[62vh] overflow-y-auto p-2 space-y-2.5">
              <Command.Empty className="py-10 text-center text-xs text-ink-secondary">
                Tidak ada modul, alat bantu, tangki, atau lini yang cocok.
              </Command.Empty>

              {/* 1. Modul Operasional 7 Tahap */}
              <Command.Group heading="Modul Operasional 7 Tahap" className={groupHeadingClass}>
                {stageModules
                  .filter(m => m.visible)
                  .map(mod => {
                    const Icon = mod.icon;
                    const isCurrent = state.currentTab === mod.tab;
                    return (
                      <Command.Item
                        key={mod.tab}
                        value={`modul operasional ${mod.label} ${mod.keywords}`}
                        onSelect={() => runAndClose(() => onSwitchTab(mod.tab))}
                        className={itemClass}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 h-6 rounded-md bg-tint-cyan border border-tint-cyan-border flex items-center justify-center shrink-0">
                            <Icon className="w-3.5 h-3.5 text-ink-cyan" />
                          </span>
                          <div className="min-w-0">
                            <span className="block truncate font-semibold text-ink-primary">
                              {mod.label}
                            </span>
                            <span className="block truncate text-[10px] text-ink-secondary font-mono tabular-nums">
                              {mod.subtitle}
                            </span>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                            isCurrent
                              ? 'bg-accent-primary text-accent-primary-foreground font-bold'
                              : 'text-ink-muted'
                          }`}
                        >
                          {isCurrent ? 'Aktif' : `Tahap ${mod.step}`}
                        </span>
                      </Command.Item>
                    );
                  })}
              </Command.Group>

              {/* 2. Alat Bantu & Laporan */}
              <Command.Group heading="Alat Bantu & Laporan" className={groupHeadingClass}>
                {isAdmin && (
                  <Command.Item
                    value="alat bantu portal utama admin beranda 7 tahap"
                    onSelect={() => runAndClose(() => onSwitchTab('admin-portal'))}
                    className={itemClass}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Home className="w-4 h-4 text-accent-primary shrink-0" />
                      <span className="truncate font-medium">Portal Utama Admin (Ikhtisar 7 Tahap)</span>
                    </div>
                    <span className="text-[10px] font-mono text-ink-amber shrink-0">Admin</span>
                  </Command.Item>
                )}

                <Command.Item
                  value="alat bantu ringkasan shift sbl stock opname konsumsi output"
                  onSelect={() => runAndClose(() => onSwitchTab('shift-summary'))}
                  className={itemClass}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ClipboardList className="w-4 h-4 text-ink-cyan shrink-0" />
                    <span className="truncate font-medium">Ringkasan Shift &amp; SBL</span>
                  </div>
                  <span className="text-[10px] font-mono text-ink-secondary shrink-0">
                    {state.currentTab === 'shift-summary' ? 'Aktif' : 'Laporan'}
                  </span>
                </Command.Item>

                {!isManagement && (
                  <Command.Item
                    value="alat bantu kalkulator bom formulasi kebutuhan material"
                    onSelect={() => runAndClose(() => onSwitchTab('bom-calculator'))}
                    className={itemClass}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Calculator className="w-4 h-4 text-ink-emerald shrink-0" />
                      <span className="truncate font-medium">Kalkulator BOM</span>
                    </div>
                    <span className="text-[10px] font-mono text-ink-secondary shrink-0">
                      {state.currentTab === 'bom-calculator' ? 'Aktif' : 'Simulasi'}
                    </span>
                  </Command.Item>
                )}

                <Command.Item
                  value="alat bantu laporan pdf shift cetak a4 landscape"
                  onSelect={() => runAndClose(onOpenPdfModal)}
                  className={itemClass}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Printer className="w-4 h-4 text-ink-rose shrink-0" />
                    <span className="truncate font-medium">Laporan PDF Shift (A4 Landscape)</span>
                  </div>
                  <span className="text-[10px] font-mono text-ink-secondary shrink-0">Cetak PDF</span>
                </Command.Item>

                <Command.Item
                  value="alat bantu sinkronisasi google sheets spreadsheet export"
                  onSelect={() => runAndClose(() => onSwitchTab('sheets-sync'))}
                  className={itemClass}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileSpreadsheet className="w-4 h-4 text-ink-emerald shrink-0" />
                    <span className="truncate font-medium">Sinkronisasi Google Sheets</span>
                  </div>
                  <span className="text-[10px] font-mono text-ink-secondary shrink-0">
                    {state.currentTab === 'sheets-sync' ? 'Aktif' : 'Integrasi'}
                  </span>
                </Command.Item>

                {isAdmin && onOpenUserManagement && (
                  <Command.Item
                    value="alat bantu manajemen user pengguna akses role operator admin"
                    onSelect={() => runAndClose(onOpenUserManagement)}
                    className={itemClass}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Users className="w-4 h-4 text-ink-amber shrink-0" />
                      <span className="truncate font-medium">Manajemen User &amp; Role</span>
                    </div>
                    <span className="text-[10px] font-mono text-ink-amber shrink-0">Admin</span>
                  </Command.Item>
                )}

                <Command.Item
                  value="alat bantu ganti role profil sesi pengguna operator administrator management"
                  onSelect={() => runAndClose(onOpenRoleSwitcher)}
                  className={itemClass}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <UserCheck className="w-4 h-4 text-ink-cyan shrink-0" />
                    <span className="truncate font-medium">Ganti Role / Profil Sesi</span>
                  </div>
                  <span className="text-[10px] font-mono text-ink-secondary shrink-0">
                    {effectiveRole.role}
                  </span>
                </Command.Item>

                <Command.Item
                  value="alat bantu pengaturan tangki liquid utama suhu sensor"
                  onSelect={() => runAndClose(onOpenTankModal)}
                  className={itemClass}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Droplet className="w-4 h-4 text-accent-primary shrink-0" />
                    <span className="truncate font-medium">Pengaturan Tangki Liquid Utama</span>
                  </div>
                  <span className="text-[10px] font-mono tabular-nums text-ink-secondary shrink-0">
                    {state.tank.temp.toFixed(1)}°C · {state.tank.level.toFixed(0)} kg
                  </span>
                </Command.Item>

                {isAdmin && (
                  <Command.Item
                    value="alat bantu penyesuaian saldo awal stock adjustment material opname"
                    onSelect={() => runAndClose(() => onOpenStockAdjustment())}
                    className={itemClass}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <SlidersHorizontal className="w-4 h-4 text-ink-amber shrink-0" />
                      <span className="truncate font-medium">Penyesuaian Saldo Awal Material</span>
                    </div>
                    <span className="text-[10px] font-mono text-ink-amber shrink-0">Admin</span>
                  </Command.Item>
                )}

                <Command.Item
                  value="alat bantu ganti tema midnight daylight gelap terang tampilan"
                  onSelect={() => runAndClose(onToggleTheme)}
                  className={itemClass}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {theme === 'daylight' ? (
                      <Moon className="w-4 h-4 text-ink-indigo shrink-0" />
                    ) : (
                      <Sun className="w-4 h-4 text-ink-amber shrink-0" />
                    )}
                    <span className="truncate font-medium">
                      {theme === 'daylight'
                        ? 'Beralih ke Tema Midnight (Control Room)'
                        : 'Beralih ke Tema Daylight (Lantai Terang)'}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-ink-secondary shrink-0">Tema</span>
                </Command.Item>
              </Command.Group>

              {/* 3. Lompat Langsung ke Objek Pabrik (Tangki WIP & Lini Produksi) */}
              {(state.master.tanks.length > 0 || productionLines.length > 0) && (
                <Command.Group
                  heading="Lompat Langsung ke Objek Pabrik"
                  className={groupHeadingClass}
                >
                  {state.master.tanks.map(tank => {
                    const assignedWip = state.master.wips.find(w => w.id === tank.assignedWipId);
                    const pct =
                      tank.capacityKg > 0
                        ? Math.min(100, Math.round((tank.currentLevelKg / tank.capacityKg) * 100))
                        : 0;
                    const isLow = tank.currentLevelKg <= (tank.minAlertKg || tank.capacityKg * 0.2);

                    return (
                      <Command.Item
                        key={`tank_${tank.id}`}
                        value={`objek pabrik tangki ${tank.code} ${tank.name} ${tank.type} ${assignedWip?.name || ''}`}
                        onSelect={() => runAndClose(() => onSelectTank(tank.id))}
                        className={itemClass}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Cylinder
                            className={`w-4 h-4 shrink-0 ${
                              isLow ? 'text-ink-amber' : 'text-ink-emerald'
                            }`}
                          />
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono font-bold text-ink-primary shrink-0">
                              {tank.code}
                            </span>
                            <span className="truncate text-ink-secondary">
                              {tank.name}
                              {assignedWip ? ` · ${assignedWip.name}` : ''}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`text-[11px] font-mono tabular-nums ${
                              isLow ? 'text-ink-amber font-semibold' : 'text-ink-emerald'
                            }`}
                          >
                            {tank.currentLevelKg.toFixed(0)}/{tank.capacityKg.toFixed(0)} kg ({pct}%)
                          </span>
                          <ArrowRight className="w-3 h-3 text-ink-muted" />
                        </div>
                      </Command.Item>
                    );
                  })}

                  {productionLines.map(line => {
                    const activeRun = runningRuns.find(r => r.lineId === line.id);
                    return (
                      <Command.Item
                        key={`line_${line.id}`}
                        value={`objek pabrik lini produksi ${line.code} ${line.name} ${line.description || ''} ${activeRun?.skuName || ''}`}
                        onSelect={() => runAndClose(() => onSelectLine(line.id))}
                        className={itemClass}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Factory
                            className={`w-4 h-4 shrink-0 ${
                              activeRun ? 'text-ink-cyan' : 'text-ink-secondary'
                            }`}
                          />
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono font-bold text-ink-primary shrink-0">
                              {line.code || line.name}
                            </span>
                            <span className="truncate text-ink-secondary">
                              {line.name}
                              {activeRun ? ` · ${activeRun.skuName}` : ' · Siaga'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded tabular-nums ${
                              activeRun
                                ? 'bg-tint-emerald text-ink-emerald font-bold'
                                : 'bg-elevated text-ink-secondary'
                            }`}
                          >
                            {activeRun
                              ? `RUN ${(activeRun.cartonsProducedTotal || 0).toLocaleString('id-ID')} ktn`
                              : 'STANDBY'}
                          </span>
                          <ArrowRight className="w-3 h-3 text-ink-muted" />
                        </div>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}
            </Command.List>

            {/* Footer Hints */}
            <div className="px-3.5 py-2 border-t border-border-subtle bg-surface-header flex items-center justify-between text-[11px] text-ink-secondary">
              <div className="flex items-center gap-3">
                <span>
                  <kbd className="px-1.5 py-0.5 rounded bg-elevated border border-border-subtle font-mono text-[10px]">
                    ↑↓
                  </kbd>{' '}
                  Pilih
                </span>
                <span>
                  <kbd className="px-1.5 py-0.5 rounded bg-elevated border border-border-subtle font-mono text-[10px]">
                    Enter
                  </kbd>{' '}
                  Buka
                </span>
              </div>
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-elevated border border-border-subtle font-mono text-[10px]">
                  Esc
                </kbd>{' '}
                Tutup
              </span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
