import React, { useState, useEffect } from 'react';
import {
  Shield,
  UserCheck,
  Building,
  KeyRound,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  PackageOpen,
  Cpu,
  Layers,
  Cylinder,
  FileText,
  Sun,
  Moon
} from 'lucide-react';
import { AppState, UserRole, RegisteredOperator, RegisteredManagement } from '../../types';
import { getCurrentShift, SHIFTS_CONFIG, ShiftNumber } from '../../utils/shifts';
import { googleSignIn } from '../../utils/googleWorkspace';

interface AuthPortalViewProps {
  state: AppState;
  theme?: 'midnight' | 'daylight' | 'light' | 'dark';
  onToggleTheme?: () => void;
  onLoginSuccess: (
    role: UserRole,
    sessionData: { id: string; name: string; subtitle?: string; email?: string }
  ) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const AuthPortalView: React.FC<AuthPortalViewProps> = ({
  state,
  theme = 'midnight',
  onToggleTheme,
  onLoginSuccess,
  showToast
}) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>('ADMINISTRATOR');
  const [adminPinInput, setAdminPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [pinError, setPinError] = useState('');

  // Operator selection
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>(
    state.registeredOperators[0]?.id || ''
  );
  const [selectedShift, setSelectedShift] = useState<ShiftNumber>(getCurrentShift().shift);

  // Management selection
  const [selectedManagementId, setSelectedManagementId] = useState<string>(
    state.registeredManagement.find(m => m.hasViewAccess)?.id || state.registeredManagement[0]?.id || ''
  );

  // Real-time clock ticker
  const [clockTime, setClockTime] = useState<string>(new Date().toLocaleTimeString('id-ID'));
  useEffect(() => {
    const timer = setInterval(() => {
      setClockTime(new Date().toLocaleTimeString('id-ID'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const currentShift = getCurrentShift();

  // Admin login handler
  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPinInput === state.adminPin) {
      onLoginSuccess('ADMINISTRATOR', {
        id: 'admin_root',
        name: 'Administrator MES & BOM',
        email: state.adminGoogleEmails?.[0] || 'admin@factory.co.id',
        subtitle: 'Kewenangan Penuh: Master BOM, Mesin, Tangki, User Access & Modul MRP'
      });
      showToast('Berhasil masuk sebagai Administrator (Akses Penuh MRP & WMS)');
    } else {
      setPinError('PIN Administrator tidak cocok. Silakan coba lagi.');
      showToast('PIN Administrator salah', true);
    }
  };

  // Google sign in for Admin
  const handleGoogleAdminSignIn = async () => {
    try {
      setIsGoogleLoading(true);
      const res = await googleSignIn();
      if (!res) return;

      const userEmail = res.user.email?.toLowerCase().trim() || '';
      const allowedList = (state.adminGoogleEmails || []).map(e => e.toLowerCase().trim());

      const isRegistered = allowedList.includes(userEmail) || userEmail === 'luasdzatzali@gmail.com';

      if (isRegistered) {
        onLoginSuccess('ADMINISTRATOR', {
          id: res.user.uid,
          name: res.user.displayName || userEmail.split('@')[0],
          email: userEmail,
          subtitle: `Administrator Terotentikasi (${res.user.displayName || 'Google OAuth'})`
        });
        showToast(`Selamat datang Administrator: ${res.user.displayName || userEmail}`);
      } else {
        showToast(
          `Akun Google (${userEmail}) belum terdaftar sebagai administrator. Gunakan PIN Administrator untuk masuk.`,
          true
        );
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal login via Google', true);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Operator login handler
  const handleOperatorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const op = state.registeredOperators.find(o => o.id === selectedOperatorId) || state.registeredOperators[0];
    if (!op) {
      showToast('Tidak ada operator terdaftar', true);
      return;
    }

    onLoginSuccess('OPERATOR', {
      id: op.id,
      name: op.name,
      subtitle: `${op.nik} • ${op.assignedLine} • Shift ${selectedShift}`
    });
    showToast(`Selamat bekerja, Operator ${op.name} (${op.assignedLine} - Shift ${selectedShift})`);
  };

  // Management login handler
  const handleManagementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mgt = state.registeredManagement.find(m => m.id === selectedManagementId) || state.registeredManagement[0];
    if (!mgt) {
      showToast('Tidak ada profil management terdaftar', true);
      return;
    }

    if (!mgt.hasViewAccess) {
      showToast(`Akses melihat belum diaktifkan oleh Administrator untuk ${mgt.name}`, true);
      return;
    }

    onLoginSuccess('MANAGEMENT', {
      id: mgt.id,
      name: mgt.name,
      email: mgt.email,
      subtitle: `${mgt.title} (${mgt.department})`
    });
    showToast(`Selamat datang ${mgt.name} (Mode Pemantauan Management)`);
  };

  const selectedMgtUser = state.registeredManagement.find(m => m.id === selectedManagementId);

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col justify-between p-3 sm:p-5 lg:p-6 relative selection:bg-cyan-500/30 selection:text-cyan-200 overflow-y-auto">
      {/* Top Bar: Brand, Theme Toggle & Shift Status */}
      <header className="relative z-10 max-w-6xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between pb-4 sm:pb-5 border-b border-slate-800/80 gap-3 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-600 to-indigo-600 p-0.5 shadow-lg shadow-cyan-900/30">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <PackageOpen className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-extrabold text-base sm:text-lg text-white tracking-tight">
                ProdTrack MES
              </h1>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold">
                MRP & WMS
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Sistem Eksekusi Manufaktur & Manajemen Pergudangan Terintegrasi
            </p>
          </div>
        </div>

        {/* Top Right: Theme Toggle, Clock & Shift Status */}
        <div className="flex items-center space-x-2">
          {/* Theme Toggle Button */}
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              type="button"
              title={
                theme === 'daylight' || theme === 'light'
                  ? 'Beralih ke Tema Midnight (Gelap Industrial)'
                  : 'Beralih ke Tema Daylight (Cerah Terang Pabrik)'
              }
              aria-label="Toggle Theme"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-750 hover:border-slate-600 text-xs font-medium text-slate-200 hover:text-white transition active:scale-95 shadow-sm"
            >
              {theme === 'daylight' || theme === 'light' ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[11px] font-semibold">Midnight</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[11px] font-semibold">Daylight</span>
                </>
              )}
            </button>
          )}

          {/* Live Shift & Realtime Clock Pill */}
          <div className="flex items-center space-x-2 text-xs font-mono bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl shadow-inner text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 font-bold">{currentShift.name}</span>
            <span className="text-slate-600">|</span>
            <span className="text-white font-semibold">{clockTime}</span>
            <span className="text-slate-600 hidden sm:inline">|</span>
            <span className="text-slate-400 text-[11px] font-sans hidden sm:inline">Biskuit & Coating Line</span>
          </div>
        </div>
      </header>

      {/* Main Content: Hero Banner + 3 Role Selection Cards */}
      <main className="relative z-10 max-w-6xl w-full mx-auto py-3 sm:py-5 space-y-4 sm:space-y-5">
        <div className="text-center max-w-2xl mx-auto space-y-1">
          <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-semibold">
            Portal Akses Masuk Pengguna
          </span>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
            Pilih Jenis Pengguna untuk Masuk
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Sistem Role-Based Access Control (RBAC) membatasi modul kerja dan hak otorisasi sesuai peran di lantai produksi.
          </p>
        </div>

        {/* Role Selector Tabs / Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
          {/* CARD 1: ADMINISTRATOR */}
          <div
            onClick={() => {
              if (selectedRole !== 'ADMINISTRATOR') {
                setSelectedRole('ADMINISTRATOR');
                setAdminPinInput('');
                setPinError('');
              }
            }}
            className={`cursor-pointer rounded-2xl p-5 border transition-all flex flex-col justify-between relative overflow-hidden ${
              selectedRole === 'ADMINISTRATOR'
                ? 'bg-slate-900/90 border-amber-500/60 shadow-xl shadow-amber-950/20 ring-1 ring-amber-500/30'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80'
            }`}
          >
            {selectedRole === 'ADMINISTRATOR' && (
              <div className="absolute top-0 right-0 bg-amber-500/20 text-amber-300 border-b border-l border-amber-500/40 text-[10px] font-semibold px-2.5 py-0.5 rounded-bl-xl font-mono uppercase">
                Aktif Dipilih
              </div>
            )}

            <div className="space-y-3">
              <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white flex items-center space-x-1.5">
                  <span>Administrator</span>
                </h3>
                <p className="text-xs text-amber-400/90 font-mono mt-0.5">
                  Akses Penuh Modul MRP & WMS
                </p>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  Mengelola konfigurasi Master BOM, resep formulasi, daftar mesin produksi, tangki WIP, dan hak akses user.
                </p>
              </div>

              {/* Form Input PIN Administrator */}
              {selectedRole === 'ADMINISTRATOR' ? (
                <form onSubmit={handleAdminSubmit} className="pt-2 space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Masukkan PIN Administrator:
                    </label>
                    <div className="relative">
                      <input
                        type={showPin ? 'text' : 'password'}
                        value={adminPinInput}
                        onChange={(e) => {
                          setAdminPinInput(e.target.value);
                          setPinError('');
                        }}
                        autoComplete="off"
                        placeholder="Masukkan PIN Administrator..."
                        required
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-3 pr-9 py-2 text-white font-mono tracking-widest text-sm focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPin(!showPin)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {pinError && (
                      <p className="text-[10px] text-rose-400 mt-1">{pinError}</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl text-xs shadow-lg shadow-amber-600/20 transition active:scale-95 flex items-center justify-center space-x-1.5"
                  >
                    <span>Masuk sebagai Administrator</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleGoogleAdminSignIn}
                    disabled={isGoogleLoading}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 rounded-xl text-xs font-medium transition flex items-center justify-center space-x-2 disabled:opacity-50"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{isGoogleLoading ? 'Menghubungkan...' : 'Login dengan Google Admin'}</span>
                  </button>
                </form>
              ) : (
                <div className="pt-3">
                  <span className="text-xs text-amber-400 font-medium flex items-center space-x-1">
                    <span>Klik untuk memilih Administrator</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[10px] text-slate-500 font-mono">
              Role: SUPER_ADMIN & Master Config
            </div>
          </div>

          {/* CARD 2: OPERATOR */}
          <div
            onClick={() => setSelectedRole('OPERATOR')}
            className={`cursor-pointer rounded-2xl p-5 border transition-all flex flex-col justify-between relative overflow-hidden ${
              selectedRole === 'OPERATOR'
                ? 'bg-slate-900/90 border-cyan-500/60 shadow-xl shadow-cyan-950/20 ring-1 ring-cyan-500/30'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80'
            }`}
          >
            {selectedRole === 'OPERATOR' && (
              <div className="absolute top-0 right-0 bg-cyan-500/20 text-cyan-300 border-b border-l border-cyan-500/40 text-[10px] font-semibold px-2.5 py-0.5 rounded-bl-xl font-mono uppercase">
                Aktif Dipilih
              </div>
            )}

            <div className="space-y-3">
              <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
                <UserCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white flex items-center space-x-1.5">
                  <span>Operator Produksi</span>
                </h3>
                <p className="text-xs text-cyan-400/90 font-mono mt-0.5">
                  Operasional Lini & Gudang
                </p>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  Menjalankan Perintah Kerja Batch WIP, menerima bahan baku GDRM di area CK & Wineroto, dan memonitor stok.
                </p>
              </div>

              {/* Form Pilih Operator & Shift */}
              {selectedRole === 'OPERATOR' ? (
                <form onSubmit={handleOperatorSubmit} className="pt-2 space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Pilih Operator Terdaftar:
                    </label>
                    <select
                      value={selectedOperatorId}
                      onChange={(e) => setSelectedOperatorId(e.target.value)}
                      required
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-500"
                    >
                      {state.registeredOperators.map(op => (
                        <option key={op.id} value={op.id}>
                          {op.name} ({op.assignedLine})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Pilih Shift Pengerjaan:
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([1, 2, 3] as ShiftNumber[]).map(sNum => (
                        <button
                          key={sNum}
                          type="button"
                          onClick={() => setSelectedShift(sNum)}
                          className={`py-1.5 rounded-xl text-xs font-semibold font-mono transition border ${
                            selectedShift === sNum
                              ? 'bg-cyan-600 border-cyan-500 text-white shadow-xs'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                          }`}
                        >
                          Shift {sNum}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl text-xs shadow-lg shadow-cyan-600/20 transition active:scale-95 flex items-center justify-center space-x-1.5"
                  >
                    <span>Masuk ke Lini Produksi</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <div className="pt-3">
                  <span className="text-xs text-cyan-400 font-medium flex items-center space-x-1">
                    <span>Klik untuk memilih Operator</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[10px] text-slate-500 font-mono">
              Role: OPERATOR (Perintah Kerja & Penerimaan)
            </div>
          </div>

          {/* CARD 3: MANAGEMENT */}
          <div
            onClick={() => setSelectedRole('MANAGEMENT')}
            className={`cursor-pointer rounded-2xl p-5 border transition-all flex flex-col justify-between relative overflow-hidden ${
              selectedRole === 'MANAGEMENT'
                ? 'bg-slate-900/90 border-indigo-500/60 shadow-xl shadow-indigo-950/20 ring-1 ring-indigo-500/30'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80'
            }`}
          >
            {selectedRole === 'MANAGEMENT' && (
              <div className="absolute top-0 right-0 bg-indigo-500/20 text-indigo-300 border-b border-l border-indigo-500/40 text-[10px] font-semibold px-2.5 py-0.5 rounded-bl-xl font-mono uppercase">
                Aktif Dipilih
              </div>
            )}

            <div className="space-y-3">
              <div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
                <Building className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white flex items-center space-x-1.5">
                  <span>Executive Management</span>
                </h3>
                <p className="text-xs text-indigo-400/90 font-mono mt-0.5">
                  Pemantauan Eksekutif (Read-Only)
                </p>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  Melihat ringkasan eksekutif simulasi produksi SKU, OEE lini, kapasitas 5 tangki WIP, dan saldo persediaan tanpa izin edit.
                </p>
              </div>

              {/* Form Pilih Profil Management */}
              {selectedRole === 'MANAGEMENT' ? (
                <form onSubmit={handleManagementSubmit} className="pt-2 space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Pilih Profil Manajemen:
                    </label>
                    <select
                      value={selectedManagementId}
                      onChange={(e) => setSelectedManagementId(e.target.value)}
                      required
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                    >
                      {state.registeredManagement.map(mgt => (
                        <option key={mgt.id} value={mgt.id}>
                          {mgt.name} ({mgt.title})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedMgtUser && (
                    <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-[11px] text-slate-400 font-medium">Status Akses:</span>
                      {selectedMgtUser.hasViewAccess ? (
                        <span className="text-[10px] font-semibold text-emerald-400 flex items-center space-x-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Izin Aktif</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-rose-400 flex items-center space-x-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Perlu Otorisasi Admin</span>
                        </span>
                      )}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs shadow-lg shadow-indigo-600/20 transition active:scale-95 flex items-center justify-center space-x-1.5"
                  >
                    <span>Masuk Pemantauan Management</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <div className="pt-3">
                  <span className="text-xs text-indigo-400 font-medium flex items-center space-x-1">
                    <span>Klik untuk memilih Management</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[10px] text-slate-500 font-mono">
              Role: MANAGEMENT (Executive Dashboard Only)
            </div>
          </div>
        </div>

        {/* Quick Demo Buttons for Instant Switching */}
        <div className="pt-4 flex flex-wrap items-center justify-center gap-2">
          <span className="text-[11px] text-slate-500 font-medium">Quick Sign In:</span>
          <button
            type="button"
            onClick={() => {
              onLoginSuccess('ADMINISTRATOR', {
                id: 'admin_root',
                name: 'Administrator MES & BOM',
                email: 'luasdzatzali@gmail.com',
                subtitle: 'Kewenangan Penuh: Master BOM & 5 Modul MRP'
              });
              showToast('Masuk instan sebagai Administrator');
            }}
            className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-semibold hover:bg-amber-500/20 transition"
          >
            🛡️ Masuk sbg Administrator
          </button>
          <button
            type="button"
            onClick={() => {
              const op = state.registeredOperators[0];
              onLoginSuccess('OPERATOR', {
                id: op.id,
                name: op.name,
                subtitle: `${op.nik} • ${op.assignedLine} • Shift 1`
              });
              showToast(`Masuk instan sebagai Operator (${op.name})`);
            }}
            className="px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-[11px] font-semibold hover:bg-cyan-500/20 transition"
          >
            👷 Masuk sbg Operator (Ahmad Fauzi)
          </button>
          <button
            type="button"
            onClick={() => {
              const mgt = state.registeredManagement[0];
              onLoginSuccess('MANAGEMENT', {
                id: mgt.id,
                name: mgt.name,
                email: mgt.email,
                subtitle: `${mgt.title} (${mgt.department})`
              });
              showToast(`Masuk instan sebagai Management (${mgt.name})`);
            }}
            className="px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-[11px] font-semibold hover:bg-indigo-500/20 transition"
          >
            👔 Masuk sbg Management (Budi Santoso)
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 max-w-6xl w-full mx-auto pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
        <div className="flex items-center space-x-2">
          <span>ProdTrack MES & WMS v4.2</span>
          <span>•</span>
          <span>Industri Makanan & Minuman</span>
        </div>
        <div className="flex items-center space-x-3 text-[11px] font-mono">
          <span>Database Lokal Terenkripsi</span>
          <span>•</span>
          <span>ISO 22000 / GMP Compliant</span>
        </div>
      </footer>
    </div>
  );
};
