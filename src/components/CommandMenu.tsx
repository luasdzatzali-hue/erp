import React, { useEffect, useState } from 'react';
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
  Home,
  MessageSquare,
  Droplet,
  Printer,
  Sun,
  Moon,
  SlidersHorizontal,
  Boxes,
  Cpu,
  UserCheck,
  X
} from 'lucide-react';
import { AppState } from '../types';
import { resolveEffectiveRole } from '../utils/roleAccess';
import { calculateStockBalances } from '../utils/storage';

interface CommandMenuProps {
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
}

export const CommandMenu: React.FC<CommandMenuProps> = ({
  open,
  onOpenChange,
  state,
  theme,
  onSwitchTab,
  onToggleTheme,
  onOpenTankModal,
  onOpenPdfModal,
  onOpenStockAdjustment,
  onOpenRoleSwitcher
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

  const stockBalances = React.useMemo(() => {
    if (!open) return new Map<string, number>();
    const balances = calculateStockBalances(state);
    const map = new Map<string, number>();
    Object.values(balances).forEach(b => {
      map.set(b.materialId, b.totalActual);
    });
    return map;
  }, [open, state]);

  const navModules: {
    tab: AppState['currentTab'];
    label: string;
    group: string;
    keywords: string;
    icon: React.ComponentType<{ className?: string }>;
    visible: boolean;
  }[] = [
    {
      tab: 'admin-portal',
      label: 'Portal Utama Admin (7 Tahap)',
      group: 'Master Data',
      keywords: 'portal admin home beranda ringkasan',
      icon: Home,
      visible: isAdmin
    },
    {
      tab: 'dashboard',
      label: 'Dashboard & Control Room Lini',
      group: 'Dashboard',
      keywords: 'dashboard manufacturing lini produksi oee karton',
      icon: LayoutDashboard,
      visible: true
    },
    {
      tab: 'weekly-planning',
      label: 'Weekly Planning Produksi',
      group: 'Weekly Planning',
      keywords: 'planning mingguan jadwal target shift',
      icon: CalendarRange,
      visible: true
    },
    {
      tab: 'bom-calculator',
      label: 'Kalkulator Kebutuhan BOM',
      group: 'BOM & Calculator',
      keywords: 'kalkulator bom formulasi kebutuhan material',
      icon: Calculator,
      visible: !isManagement
    },
    {
      tab: 'permintaan',
      label: 'Permintaan Material (Slip Order)',
      group: 'Manufacturing Ops',
      keywords: 'permintaan material request gdrm order bon',
      icon: FileText,
      visible: !isManagement
    },
    {
      tab: 'penerimaan',
      label: 'Penerimaan Fisik Material',
      group: 'Manufacturing Ops',
      keywords: 'penerimaan receipt kedatangan timbangan zak lot',
      icon: Truck,
      visible: !isManagement
    },
    {
      tab: 'pemakaian',
      label: 'Work Order WIP & Batch Mesin',
      group: 'Manufacturing Ops',
      keywords: 'work order wip batch mesin pemakaian fifo gantt',
      icon: Layers,
      visible: !isManagement
    },
    {
      tab: 'tank-monitoring',
      label: 'Monitoring & Diagram P&ID Tangki WIP',
      group: 'Manufacturing Ops',
      keywords: 'tangki wip scada holding storage transfer level pid',
      icon: Cylinder,
      visible: true
    },
    {
      tab: 'shift-summary',
      label: 'Ringkasan Shift & Stock Opname',
      group: 'Stock Opname & Reports',
      keywords: 'ringkasan shift stock opname sbl konsumsi output',
      icon: ClipboardList,
      visible: true
    },
    {
      tab: 'sheets-sync',
      label: 'Integrasi Google Sheets Sync',
      group: 'Stock Opname & Reports',
      keywords: 'google sheets sync integrasi export laporan',
      icon: FileSpreadsheet,
      visible: true
    },
    {
      tab: 'master',
      label: 'Konfigurasi Master BOM, Mesin & Tangki',
      group: 'Master Data',
      keywords: 'master bom sku wip resep material mesin tangki',
      icon: Database,
      visible: isAdmin
    },
    {
      tab: 'contact',
      label: 'Kontak & Dukungan Teknis MES',
      group: 'Bantuan',
      keywords: 'kontak dukungan support helpdesk',
      icon: MessageSquare,
      visible: true
    }
  ];

  const groupHeadingClass =
    '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-secondary';

  const itemClass =
    'flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-xs text-ink-primary cursor-pointer transition-colors aria-selected:bg-elevated aria-selected:text-ink-primary data-[selected=true]:bg-elevated hover:bg-elevated/70';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-[94vw] max-w-2xl -translate-x-1/2 rounded-xl border border-border-strong bg-surface text-ink-primary shadow-2xl overflow-hidden focus:outline-none"
        >
          <Dialog.Title className="sr-only">
            Pencarian Cepat &amp; Perintah ProdTrack MES
          </Dialog.Title>

          <Command label="Command Palette" className="flex flex-col w-full">
            {/* Search Input Header */}
            <div className="flex items-center gap-2.5 px-3.5 h-12 border-b border-border-subtle bg-surface-header">
              <Search className="w-4 h-4 text-accent-primary shrink-0" />
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder="Cari kode SKU, material, tangki (HT-01 / ST-01), modul, atau aksi cepat..."
                className="flex-1 bg-transparent text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none"
              />
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Tutup Pencarian Cepat"
                className="p-1 rounded-md text-ink-secondary hover:text-ink-primary hover:bg-elevated transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Results List */}
            <Command.List className="max-h-[60vh] overflow-y-auto p-2 space-y-2">
              <Command.Empty className="py-10 text-center text-xs text-ink-secondary">
                Tidak ditemukan modul, SKU, material, atau tangki yang cocok.
              </Command.Empty>

              {/* 1. Quick Actions */}
              <Command.Group heading="Aksi Cepat" className={groupHeadingClass}>
                <Command.Item
                  value="aksi buka storage tank liquid suhu sensor"
                  onSelect={() => runAndClose(onOpenTankModal)}
                  className={itemClass}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Droplet className="w-4 h-4 text-accent-primary shrink-0" />
                    <span className="truncate font-medium">Buka Pengaturan Storage Tank Liquid</span>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-ink-secondary shrink-0">
                    {state.tank.temp.toFixed(1)}°C · {state.tank.level.toFixed(0)} kg
                  </span>
                </Command.Item>

                <Command.Item
                  value="aksi unduh laporan shift pdf landscape"
                  onSelect={() => runAndClose(onOpenPdfModal)}
                  className={itemClass}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Printer className="w-4 h-4 text-ink-rose shrink-0" />
                    <span className="truncate font-medium">Buka &amp; Cetak Laporan Shift (PDF A4)</span>
                  </div>
                  <span className="text-[10px] font-mono text-ink-secondary shrink-0">PDF Shift</span>
                </Command.Item>

                {isAdmin && (
                  <Command.Item
                    value="aksi penyesuaian saldo stock adjustment material"
                    onSelect={() => runAndClose(() => onOpenStockAdjustment())}
                    className={itemClass}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <SlidersHorizontal className="w-4 h-4 text-ink-amber shrink-0" />
                      <span className="truncate font-medium">Penyesuaian Saldo Awal / Stock Opname Material</span>
                    </div>
                    <span className="text-[10px] font-mono text-ink-amber shrink-0">Admin</span>
                  </Command.Item>
                )}

                <Command.Item
                  value="aksi ganti tema theme midnight daylight gelap terang"
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

                <Command.Item
                  value="aksi ganti role pengguna operator administrator management"
                  onSelect={() => runAndClose(onOpenRoleSwitcher)}
                  className={itemClass}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <UserCheck className="w-4 h-4 text-ink-cyan shrink-0" />
                    <span className="truncate font-medium">Ganti Role / Profil Sesi Pengguna</span>
                  </div>
                  <span className="text-[10px] font-mono text-ink-secondary shrink-0">
                    {effectiveRole.role}
                  </span>
                </Command.Item>
              </Command.Group>

              {/* 2. Modules */}
              <Command.Group heading="Modul &amp; Navigasi" className={groupHeadingClass}>
                {navModules
                  .filter(m => m.visible)
                  .map(mod => {
                    const Icon = mod.icon;
                    const isCurrent = state.currentTab === mod.tab;
                    return (
                      <Command.Item
                        key={mod.tab}
                        value={`modul ${mod.label} ${mod.group} ${mod.keywords}`}
                        onSelect={() => runAndClose(() => onSwitchTab(mod.tab))}
                        className={itemClass}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon className="w-4 h-4 text-accent-primary shrink-0" />
                          <span className="truncate font-medium">{mod.label}</span>
                        </div>
                        <span className="text-[10px] font-mono text-ink-secondary shrink-0">
                          {isCurrent ? 'Aktif' : mod.group}
                        </span>
                      </Command.Item>
                    );
                  })}
              </Command.Group>

              {/* 3. WIP Tanks */}
              {state.master.tanks.length > 0 && (
                <Command.Group heading="Tangki WIP (Holding &amp; Storage)" className={groupHeadingClass}>
                  {state.master.tanks.map(tank => {
                    const assignedWip = state.master.wips.find(w => w.id === tank.assignedWipId);
                    const pct =
                      tank.capacityKg > 0
                        ? Math.min(100, Math.round((tank.currentLevelKg / tank.capacityKg) * 100))
                        : 0;
                    return (
                      <Command.Item
                        key={tank.id}
                        value={`tangki ${tank.code} ${tank.name} ${tank.type} ${assignedWip?.name || ''}`}
                        onSelect={() => runAndClose(() => onSwitchTab('tank-monitoring'))}
                        className={itemClass}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Cylinder className="w-4 h-4 text-ink-emerald shrink-0" />
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
                        <span className="text-[11px] font-mono tabular-nums text-ink-emerald shrink-0">
                          {tank.currentLevelKg.toFixed(0)}/{tank.capacityKg.toFixed(0)} kg ({pct}%)
                        </span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}

              {/* 4. SKUs */}
              {state.master.skus.length > 0 && (
                <Command.Group heading="SKU Produk" className={groupHeadingClass}>
                  {state.master.skus.map(sku => (
                    <Command.Item
                      key={sku.id}
                      value={`sku ${sku.code || ''} ${sku.name} ${sku.isKite ? 'kite' : 'reguler'}`}
                      onSelect={() => runAndClose(() => onSwitchTab('dashboard'))}
                      className={itemClass}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Cpu className="w-4 h-4 text-ink-cyan shrink-0" />
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-bold text-ink-primary shrink-0">
                            {sku.code || sku.id.slice(-6)}
                          </span>
                          <span className="truncate text-ink-secondary">{sku.name}</span>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-ink-secondary shrink-0">
                        {sku.targetHour} ktn/jam
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* 5. Materials */}
              {state.master.materials.length > 0 && (
                <Command.Group heading="Material Baku &amp; Kemasan" className={groupHeadingClass}>
                  {state.master.materials.map(mat => {
                    const qty = stockBalances.get(mat.id) ?? 0;
                    const targetTab: AppState['currentTab'] = !isManagement
                      ? 'permintaan'
                      : 'shift-summary';
                    return (
                      <Command.Item
                        key={mat.id}
                        value={`material ${mat.code || ''} ${mat.name} ${mat.source} ${mat.type}`}
                        onSelect={() => runAndClose(() => onSwitchTab(targetTab))}
                        className={itemClass}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Boxes className="w-4 h-4 text-ink-amber shrink-0" />
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono font-bold text-ink-primary shrink-0">
                              {mat.code || mat.id.slice(-6)}
                            </span>
                            <span className="truncate text-ink-secondary">{mat.name}</span>
                          </div>
                        </div>
                        <span className="text-[11px] font-mono tabular-nums text-ink-secondary shrink-0">
                          {qty.toLocaleString('id-ID')} kg
                        </span>
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
