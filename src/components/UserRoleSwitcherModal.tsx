import React, { useState } from 'react';
import {
  Shield,
  UserCheck,
  Building,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  X,
  Lock,
  ArrowRight,
  Eye,
  Info
} from 'lucide-react';
import { AppState, UserRole, RegisteredOperator, RegisteredManagement } from '../types';

interface UserRoleSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  onSelectRole: (role: UserRole, sessionData?: { id: string; name: string; subtitle?: string; email?: string }) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const UserRoleSwitcherModal: React.FC<UserRoleSwitcherModalProps> = ({
  isOpen,
  onClose,
  state,
  onSelectRole,
  showToast
}) => {
  const [selectedRoleTab, setSelectedRoleTab] = useState<UserRole>(state.currentUserRole);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>(
    state.registeredOperators[0]?.id || ''
  );
  const [selectedManagementId, setSelectedManagementId] = useState<string>(
    state.registeredManagement.find(m => m.hasViewAccess)?.id || state.registeredManagement[0]?.id || ''
  );
  const [pinError, setPinError] = useState('');

  if (!isOpen) return null;

  // Handle switching to Administrator
  const handleConfirmAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPinInput === state.adminPin) {
      onSelectRole('ADMINISTRATOR', {
        id: 'admin_root',
        name: 'Administrator MES & BOM',
        email: state.adminGoogleEmails?.[0] || 'admin@factory.co.id',
        subtitle: 'Kewenangan Penuh: Master BOM, Mesin, Tangki & User Access'
      });
      setAdminPinInput('');
      setPinError('');
      showToast('Berhasil masuk sebagai Administrator (Akses Penuh)');
      onClose();
    } else {
      setPinError('PIN Administrator salah. Silakan coba lagi.');
      showToast('PIN Administrator tidak cocok', true);
    }
  };

  // Handle switching to Operator
  const handleConfirmOperator = () => {
    const op = state.registeredOperators.find(o => o.id === selectedOperatorId) || state.registeredOperators[0];
    if (!op) {
      showToast('Tidak ada operator terdaftar', true);
      return;
    }
    onSelectRole('OPERATOR', {
      id: op.id,
      name: op.name,
      subtitle: `${op.nik} • ${op.assignedLine} • Shift ${op.assignedShift}`
    });
    showToast(`Beralih ke Operator: ${op.name} (${op.assignedLine})`);
    onClose();
  };

  // Handle switching to Management
  const handleConfirmManagement = () => {
    const mgt = state.registeredManagement.find(m => m.id === selectedManagementId) || state.registeredManagement[0];
    if (!mgt) {
      showToast('Tidak ada profil management terdaftar', true);
      return;
    }

    if (!mgt.hasViewAccess) {
      showToast(`Izin melihat belum diaktifkan oleh Administrator untuk ${mgt.name}`, true);
      return;
    }

    onSelectRole('MANAGEMENT', {
      id: mgt.id,
      name: mgt.name,
      email: mgt.email,
      subtitle: `${mgt.title} (${mgt.department})`
    });
    showToast(`Beralih ke Mode Management: ${mgt.name} (Hanya Melihat)`);
    onClose();
  };

  const selectedMgtUser = state.registeredManagement.find(m => m.id === selectedManagementId);

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl shadow-xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-base sm:text-lg text-slate-900 flex items-center space-x-2">
              <span>Pilih Jenis Pengguna (Akses Portal Web)</span>
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Sistem Role-Based Access Control (RBAC) terbagi menjadi 3 jenis otoritas
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Active User Banner */}
        <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
              state.currentUserRole === 'ADMINISTRATOR'
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : state.currentUserRole === 'OPERATOR'
                ? 'bg-sky-100 text-sky-800 border border-sky-300'
                : 'bg-indigo-100 text-indigo-800 border border-indigo-300'
            }`}>
              {state.currentUserRole === 'ADMINISTRATOR' ? <Shield className="w-4 h-4" /> : state.currentUserRole === 'OPERATOR' ? <UserCheck className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-slate-900">{state.currentSession?.name || 'User'}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  state.currentUserRole === 'ADMINISTRATOR'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : state.currentUserRole === 'OPERATOR'
                    ? 'bg-sky-100 text-sky-900 border border-sky-300'
                    : 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                }`}>
                  {state.currentUserRole}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 font-mono truncate max-w-xs">
                {state.currentSession?.subtitle || 'Sesi Aktif'}
              </p>
            </div>
          </div>
          <span className="text-[11px] text-emerald-700 font-bold flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Aktif</span>
          </span>
        </div>

        {/* 3 Role Selection Segmented Tabs */}
        <div className="p-5 overflow-y-auto space-y-4">
          <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => setSelectedRoleTab('ADMINISTRATOR')}
              className={`py-2.5 px-2 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center space-y-1 ${
                selectedRoleTab === 'ADMINISTRATOR'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>1. Administrator</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedRoleTab('OPERATOR')}
              className={`py-2.5 px-2 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center space-y-1 ${
                selectedRoleTab === 'OPERATOR'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>2. Operator</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedRoleTab('MANAGEMENT')}
              className={`py-2.5 px-2 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center space-y-1 ${
                selectedRoleTab === 'MANAGEMENT'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Building className="w-4 h-4" />
              <span>3. Management</span>
            </button>
          </div>

          {/* TAB 1: ADMINISTRATOR */}
          {selectedRoleTab === 'ADMINISTRATOR' && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3.5">
              <div className="flex items-start space-x-3">
                <div className="p-2.5 rounded-xl bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                  <Shield className="w-5 h-5" />
                </div>
                <div className="text-xs space-y-1">
                  <h3 className="font-bold text-slate-900 text-sm">Administrator (Kewenangan Penuh)</h3>
                  <p className="text-slate-700 leading-relaxed">
                    Pengguna dengan kewenangan tertinggi untuk melakukan perubahan/kustomisasi:
                  </p>
                  <ul className="text-slate-600 list-disc list-inside space-y-0.5 pt-1 text-[11px]">
                    <li>Hierarki alur BOM, resep komponen WIP & SKU</li>
                    <li>Master tangki penyimpanan & konfigurasi storage</li>
                    <li>Master mesin produksi & penugasan multi-mesin</li>
                    <li>Penyesuaian saldo inventory & stok aktual</li>
                    <li><strong>Pendaftaran operator</strong> & penugasan shift</li>
                    <li><strong>Memberikan izin akses melihat</strong> kepada akun management terdaftar</li>
                  </ul>
                  <div className="pt-2 text-amber-800 text-[11px] font-semibold flex items-center space-x-1">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Menu Administrator otomatis disembunyikan untuk Operator dan Management.</span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleConfirmAdmin} className="space-y-3 pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center justify-between">
                    <span>Masukkan PIN Administrator:</span>
                    <span className="text-[10px] text-slate-500 font-mono">PIN Default: 12345678</span>
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      autoFocus
                      required
                      value={adminPinInput}
                      onChange={(e) => {
                        setAdminPinInput(e.target.value);
                        setPinError('');
                      }}
                      placeholder="Masukkan 8-digit PIN..."
                      className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-slate-900 font-mono text-sm tracking-widest focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  {pinError && (
                    <p className="text-xs text-rose-600 font-semibold mt-1 flex items-center space-x-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{pinError}</span>
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center space-x-1.5 active:scale-95"
                >
                  <Shield className="w-4 h-4" />
                  <span>Verifikasi PIN & Masuk Administrator</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: OPERATOR */}
          {selectedRoleTab === 'OPERATOR' && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3.5">
              <div className="flex items-start space-x-3">
                <div className="p-2.5 rounded-xl bg-sky-100 text-sky-800 border border-sky-300 shrink-0">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div className="text-xs space-y-1">
                  <h3 className="font-bold text-slate-900 text-sm">Operator (Lantai Produksi & Gudang)</h3>
                  <p className="text-slate-700 leading-relaxed">
                    Pengguna operasional pabrik yang berwenang melakukan:
                  </p>
                  <ul className="text-slate-600 list-disc list-inside space-y-0.5 pt-1 text-[11px]">
                    <li>Monitoring stok bahan baku & tangki WIP (Holding/Storage)</li>
                    <li>Pemesanan material baru (Permintaan Material ke Gudang)</li>
                    <li>Penerimaan material (Receiving & Verifikasi Lot)</li>
                    <li>Pemakaian material & perintah kerja 1-batch WIP</li>
                    <li>Produksi SKU (Tombol Start/Stop & pengurangan tangki real-time)</li>
                    <li>Kalkulator kebutuhan batch & formulasi BOM</li>
                    <li>Mencetak laporan harian & shift produksi format PDF</li>
                  </ul>
                  <p className="text-slate-500 text-[11px] italic pt-1">
                    * Menu Konfigurasi Master BOM disembunyikan untuk akun Operator.
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-200">
                <label className="block text-xs font-medium text-slate-700">
                  Pilih Profil Operator Terdaftar:
                </label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto no-scrollbar">
                  {state.registeredOperators.map(op => {
                    const isSelected = selectedOperatorId === op.id;
                    return (
                      <div
                        key={op.id}
                        onClick={() => setSelectedOperatorId(op.id)}
                        className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between transition text-xs ${
                          isSelected
                            ? 'bg-sky-50 border-sky-500 text-slate-900 shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div>
                          <div className="font-bold flex items-center space-x-2">
                            <span>{op.name}</span>
                            <span className="font-mono text-[10px] text-sky-700 font-semibold">{op.nik}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {op.assignedLine} • Shift {op.assignedShift} {op.notes ? `• ${op.notes}` : ''}
                          </div>
                        </div>
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                          isSelected ? 'border-sky-600 bg-cyan-600 text-white' : 'border-slate-300'
                        }`}>
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleConfirmOperator}
                  className="w-full mt-2 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center space-x-1.5 active:scale-95"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Gunakan Akun Operator Ini</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: MANAGEMENT */}
          {selectedRoleTab === 'MANAGEMENT' && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3.5">
              <div className="flex items-start space-x-3">
                <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-800 border border-indigo-300 shrink-0">
                  <Building className="w-5 h-5" />
                </div>
                <div className="text-xs space-y-1">
                  <h3 className="font-bold text-slate-900 text-sm">Management (Hanya Melihat / Read-Only)</h3>
                  <p className="text-slate-700 leading-relaxed">
                    Pengguna eksekutif/manajerial yang <strong>hanya memiliki akses melihat (pantau)</strong>:
                  </p>
                  <ul className="text-slate-600 list-disc list-inside space-y-0.5 pt-1 text-[11px]">
                    <li><strong>Dashboard Produksi:</strong> Memantau produksi SKU berjalan, laju karton/jam, shift, dan downtime TPM Six Big Losses.</li>
                    <li><strong>Stock Material:</strong> Saldo stok aktual di Gudang CK, WINEROTO, dan Tangki Liquid.</li>
                    <li><strong>Monitoring Tangki WIP:</strong> Melihat level isi holding tank & storage tank, suhu, dan status agitator.</li>
                    <li><strong>Laporan Harian:</strong> Membaca dan mengunduh laporan ringkasan shift dalam format PDF.</li>
                  </ul>
                  <p className="text-amber-800 text-[11px] font-semibold pt-1">
                    🔒 Akses dibatasi: Tidak dapat melakukan modifikasi data, transaksi bahan, maupun mengubah status mesin.
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-200">
                <label className="block text-xs font-medium text-slate-700">
                  Pilih Profil Management Terdaftar:
                </label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto no-scrollbar">
                  {state.registeredManagement.map(mgt => {
                    const isSelected = selectedManagementId === mgt.id;
                    return (
                      <div
                        key={mgt.id}
                        onClick={() => setSelectedManagementId(mgt.id)}
                        className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between transition text-xs ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-400 text-slate-900 shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div>
                          <div className="font-bold flex items-center space-x-2">
                            <span>{mgt.name}</span>
                            {mgt.hasViewAccess ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold">
                                Izin Diberikan
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded text-[9px] bg-rose-100 text-rose-800 border border-rose-300 font-semibold">
                                Izin Belum Aktif
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {mgt.title} • {mgt.department}
                          </div>
                        </div>
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                          isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'
                        }`}>
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {selectedMgtUser && !selectedMgtUser.hasViewAccess && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-[11px] text-rose-800 flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>
                      Profil ini belum diberikan izin melihat oleh Administrator. Masuk sebagai Administrator untuk mengaktifkan izin di modul Master Data & Pengguna.
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  disabled={!selectedMgtUser?.hasViewAccess}
                  onClick={handleConfirmManagement}
                  className={`w-full mt-2 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-xs ${
                    selectedMgtUser?.hasViewAccess
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                  }`}
                >
                  <Building className="w-4 h-4" />
                  <span>
                    {selectedMgtUser?.hasViewAccess
                      ? 'Masuk Mode Management (Pantau Saja)'
                      : 'Izin Melihat Belum Diberikan Admin'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-semibold transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
