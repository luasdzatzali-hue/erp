import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  Shield,
  UserCheck,
  Building,
  KeyRound,
  ArrowRight,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  PackageOpen,
  Sun,
  Moon,
  Cloud,
  CloudOff,
  Loader2,
  Sparkles,
  LogOut,
  Factory,
  Database,
  Lock
} from 'lucide-react';
import { AppState, UserRole } from '../../types';
import { getCurrentShift, ShiftNumber } from '../../utils/shifts';
import { signInWithGoogleAuth } from '../../utils/firebaseSync';

interface AuthPortalViewProps {
  state: AppState;
  theme?: 'midnight' | 'daylight' | 'light' | 'dark';
  onToggleTheme?: () => void;
  setupStatus: 'checking' | 'needs_setup' | 'ready' | 'error';
  cloudFactoryName?: string;
  firebaseUser: User | null;
  cloudAuthRole?: UserRole | null;
  isSyncingCloud: boolean;
  onRetryCheckSetup: () => void;
  onCompleteFirstAdminSetup: (data: {
    user: User;
    factoryName: string;
    adminName: string;
    adminPin: string;
    initMode: 'template' | 'blank';
  }) => Promise<void>;
  onGoogleCloudLogin: (intendedRole?: UserRole) => Promise<void>;
  onFirebaseSignOut: () => Promise<void>;
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
  setupStatus,
  cloudFactoryName,
  firebaseUser,
  cloudAuthRole,
  isSyncingCloud,
  onRetryCheckSetup,
  onCompleteFirstAdminSetup,
  onGoogleCloudLogin,
  onFirebaseSignOut,
  onLoginSuccess,
  showToast
}) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>('ADMINISTRATOR');
  const [adminPinInput, setAdminPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [pinError, setPinError] = useState('');

  // First-time Admin Setup Wizard state
  const [setupUser, setSetupUser] = useState<User | null>(firebaseUser);
  const [setupFactoryName, setSetupFactoryName] = useState('PT Pabrik Manufaktur Nusantara');
  const [setupAdminName, setSetupAdminName] = useState(firebaseUser?.displayName || '');
  const [setupPin, setSetupPin] = useState('');
  const [setupPinConfirm, setSetupPinConfirm] = useState('');
  const [showSetupPin, setShowSetupPin] = useState(false);
  const [setupInitMode, setSetupInitMode] = useState<'template' | 'blank'>('template');
  const [isSubmittingSetup, setIsSubmittingSetup] = useState(false);

  useEffect(() => {
    if (firebaseUser) {
      setSetupUser(firebaseUser);
      if (!setupAdminName && firebaseUser.displayName) {
        setSetupAdminName(firebaseUser.displayName);
      }
    }
  }, [firebaseUser]);

  // Operator & Management selection
  const activeOperators = (state.registeredOperators || []).filter(op => op.status === 'ACTIVE');
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>(
    activeOperators[0]?.id || ''
  );
  const [selectedShift, setSelectedShift] = useState<ShiftNumber>(getCurrentShift().shift);

  const [selectedManagementId, setSelectedManagementId] = useState<string>(
    state.registeredManagement.find(m => m.hasViewAccess)?.id || state.registeredManagement[0]?.id || ''
  );

  useEffect(() => {
    if (activeOperators.length > 0 && !activeOperators.some(o => o.id === selectedOperatorId)) {
      setSelectedOperatorId(activeOperators[0].id);
    }
  }, [state.registeredOperators]);

  useEffect(() => {
    if (
      state.registeredManagement.length > 0 &&
      !state.registeredManagement.some(m => m.id === selectedManagementId)
    ) {
      setSelectedManagementId(
        state.registeredManagement.find(m => m.hasViewAccess)?.id || state.registeredManagement[0].id
      );
    }
  }, [state.registeredManagement]);

  // Real-time clock ticker
  const [clockTime, setClockTime] = useState<string>(new Date().toLocaleTimeString('id-ID'));
  useEffect(() => {
    const timer = setInterval(() => {
      setClockTime(new Date().toLocaleTimeString('id-ID'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const currentShift = getCurrentShift();
  const isWorkspaceSyncedOnDevice = Boolean(firebaseUser && state.cloudOwnerUid);

  // Setup Wizard: Step 1 Connect Google Account
  const handleConnectGoogleForSetup = async () => {
    try {
      setIsGoogleLoading(true);
      const user = await signInWithGoogleAuth();
      if (!user) return;
      setSetupUser(user);
      setSetupAdminName(prev => prev.trim() || user.displayName || user.email?.split('@')[0] || 'Administrator');
      showToast(`Akun Google terhubung: ${user.email}`);
    } catch (err: any) {
      showToast(err.message || 'Gagal menghubungkan akun Google', true);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Setup Wizard: Submit First-Time Admin Registration
  const handleSetupWizardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupUser) {
      showToast('Hubungkan akun Google Administrator terlebih dahulu pada Langkah 1.', true);
      return;
    }
    if (!setupFactoryName.trim()) {
      showToast('Harap isi Nama Pabrik / Perusahaan.', true);
      return;
    }
    if (!setupAdminName.trim()) {
      showToast('Harap isi Nama Lengkap Administrator.', true);
      return;
    }
    if (setupPin.length < 4 || setupPin.length > 16) {
      showToast('PIN Keamanan Administrator harus 4 - 16 karakter.', true);
      return;
    }
    if (setupPin !== setupPinConfirm) {
      showToast('Konfirmasi PIN tidak cocok.', true);
      return;
    }

    try {
      setIsSubmittingSetup(true);
      await onCompleteFirstAdminSetup({
        user: setupUser,
        factoryName: setupFactoryName.trim(),
        adminName: setupAdminName.trim(),
        adminPin: setupPin.trim(),
        initMode: setupInitMode
      });
    } catch (err: any) {
      showToast(err?.message || 'Gagal mendaftarkan Administrator pertama ke Cloud.', true);
    } finally {
      setIsSubmittingSetup(false);
    }
  };

  // Admin PIN login (only allowed when device has already synced the workspace from Cloud)
  const handleAdminPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isWorkspaceSyncedOnDevice) {
      showToast('Silakan masuk dengan Akun Google Admin terlebih dahulu untuk menyinkronkan data Cloud ke perangkat ini.', true);
      return;
    }
    if (adminPinInput === state.adminPin) {
      onLoginSuccess('ADMINISTRATOR', {
        id: firebaseUser?.uid || 'admin_root',
        name: state.currentAdminUser?.displayName || firebaseUser?.displayName || 'Administrator MES & BOM',
        email: firebaseUser?.email || state.adminGoogleEmails?.[0] || '',
        subtitle: `Akses Penuh: Master BOM, Mesin, Tangki, User Access & MRP (${state.factoryName || 'ProdTrack'})`
      });
      showToast('Berhasil masuk sebagai Administrator (Akses Penuh MRP & WMS)');
    } else {
      setPinError('PIN Administrator tidak cocok. Silakan coba lagi.');
      showToast('PIN Administrator salah', true);
    }
  };

  // Google Cloud sign in for Admin / Operator / Management
  const handleGoogleCloudSignIn = async (intendedRole?: UserRole) => {
    try {
      setIsGoogleLoading(true);
      await onGoogleCloudLogin(intendedRole);
    } catch (err: any) {
      showToast(err?.message || 'Gagal masuk via Google Cloud', true);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Operator login handler
  const handleOperatorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isWorkspaceSyncedOnDevice) {
      showToast('Perangkat belum terhubung ke Cloud Pabrik. Hubungkan via Google terlebih dahulu.', true);
      return;
    }
    const op = activeOperators.find(o => o.id === selectedOperatorId) || activeOperators[0];
    if (!op) {
      showToast('Belum ada Operator aktif yang didaftarkan oleh Administrator.', true);
      return;
    }

    onLoginSuccess('OPERATOR', {
      id: op.id,
      name: op.name,
      email: op.email,
      subtitle: `${op.nik} • ${op.assignedLine} • Shift ${selectedShift}`
    });
    showToast(`Selamat bekerja, Operator ${op.name} (${op.assignedLine} - Shift ${selectedShift})`);
  };

  // Management login handler
  const handleManagementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isWorkspaceSyncedOnDevice) {
      showToast('Perangkat belum terhubung ke Cloud Pabrik. Masuk dengan Google Management terlebih dahulu.', true);
      return;
    }
    const mgt = state.registeredManagement.find(m => m.id === selectedManagementId) || state.registeredManagement[0];
    if (!mgt) {
      showToast('Belum ada profil Management yang didaftarkan oleh Administrator.', true);
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
      {/* Top Bar: Brand, Cloud Status, Theme Toggle & Shift Status */}
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
                CLOUD SYNC
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {cloudFactoryName || state.factoryName || 'Sistem Eksekusi Manufaktur & Manajemen Pergudangan Terintegrasi'}
            </p>
          </div>
        </div>

        {/* Top Right: Cloud Connection, Theme Toggle, Clock & Shift Status */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {firebaseUser && (
            <div className="flex items-center space-x-2 bg-emerald-950/50 border border-emerald-500/40 px-2.5 py-1.5 rounded-xl text-[11px] text-emerald-300">
              <Cloud className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="font-mono truncate max-w-[160px]">{firebaseUser.email}</span>
              <button
                type="button"
                onClick={onFirebaseSignOut}
                title="Putuskan sesi akun Google dari perangkat ini"
                className="text-slate-400 hover:text-rose-300 transition p-0.5"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

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

          <div className="flex items-center space-x-2 text-xs font-mono bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl shadow-inner text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 font-bold">{currentShift.name}</span>
            <span className="text-slate-600">|</span>
            <span className="text-white font-semibold">{clockTime}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-6xl w-full mx-auto py-4 sm:py-6 flex-1 flex flex-col justify-center">
        {/* STATE 1: CHECKING FIRESTORE SETUP STATUS */}
        {setupStatus === 'checking' && (
          <div className="max-w-md mx-auto w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-cyan-400 animate-spin" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white">Memeriksa Database Cloud...</h2>
              <p className="text-xs text-slate-400">
                Mengecek status pendaftaran Administrator pertama &amp; sinkronisasi Master BOM pabrik.
              </p>
            </div>
          </div>
        )}

        {/* STATE 2: CONNECTION ERROR */}
        {setupStatus === 'error' && (
          <div className="max-w-md mx-auto w-full bg-slate-900/90 border border-rose-500/40 rounded-3xl p-7 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <CloudOff className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold text-white">Gagal Terhubung ke Cloud Database</h2>
              <p className="text-xs text-slate-400">
                Periksa koneksi internet Anda lalu coba periksa ulang status pendaftaran Administrator.
              </p>
            </div>
            <button
              type="button"
              onClick={onRetryCheckSetup}
              className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition"
            >
              Coba Hubungkan Ulang
            </button>
          </div>
        )}

        {/* STATE 3: FIRST-TIME ADMINISTRATOR SETUP WIZARD */}
        {setupStatus === 'needs_setup' && (
          <div className="max-w-2xl mx-auto w-full space-y-5">
            <div className="text-center space-y-1.5">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-mono font-bold uppercase">
                <Sparkles className="w-3.5 h-3.5" />
                <span>First-Time Setup Wizard</span>
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Pendaftaran Akun Administrator Pertama
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
                Website baru pertama kali dibuka dan belum memiliki Administrator terdaftar. Akun Administrator ini akan menyimpan seluruh Master BOM, lini produksi, serta hak akses Operator &amp; Manajemen secara permanen di Cloud agar dapat diakses dari perangkat dan jaringan mana saja.
              </p>
            </div>

            <form
              onSubmit={handleSetupWizardSubmit}
              className="bg-slate-900/90 border border-amber-500/40 rounded-3xl p-5 sm:p-7 space-y-5 shadow-2xl shadow-amber-950/20"
            >
              {/* Step 1: Google Auth Connection */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2.5">
                    <span className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0">
                      1
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-white">
                        Hubungkan Akun Google Administrator Utama
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Digunakan sebagai identitas Cloud untuk login kembali dari perangkat &amp; internet mana saja.
                      </p>
                    </div>
                  </div>
                </div>

                {setupUser ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-white">
                          {setupUser.displayName || 'Administrator'}
                        </div>
                        <div className="text-[11px] font-mono text-emerald-300">
                          {setupUser.email}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleConnectGoogleForSetup}
                      disabled={isGoogleLoading}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold transition"
                    >
                      Ganti Akun Google
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleConnectGoogleForSetup}
                    disabled={isGoogleLoading}
                    className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 shadow-lg shadow-cyan-600/20 transition active:scale-95 disabled:opacity-50"
                  >
                    {isGoogleLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <KeyRound className="w-4 h-4" />
                    )}
                    <span>
                      {isGoogleLoading
                        ? 'Menghubungkan Akun Google...'
                        : 'Hubungkan Akun Google Administrator'}
                    </span>
                  </button>
                )}
              </div>

              {/* Step 2: Factory & Security Profile */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3.5">
                <div className="flex items-center space-x-2.5">
                  <span className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0">
                    2
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Identitas Pabrik, Keamanan PIN &amp; Data Awal BOM
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Konfigurasi workspace Cloud pertama Anda.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      <Factory className="w-3.5 h-3.5 inline mr-1 text-cyan-400" />
                      Nama Pabrik / Perusahaan:
                    </label>
                    <input
                      type="text"
                      required
                      value={setupFactoryName}
                      onChange={e => setSetupFactoryName(e.target.value)}
                      placeholder="cth: PT ProdTrack Foods Indonesia"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      <Shield className="w-3.5 h-3.5 inline mr-1 text-amber-400" />
                      Nama Lengkap Administrator:
                    </label>
                    <input
                      type="text"
                      required
                      value={setupAdminName}
                      onChange={e => setSetupAdminName(e.target.value)}
                      placeholder="Nama Super Administrator..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      <Lock className="w-3.5 h-3.5 inline mr-1 text-amber-400" />
                      Buat PIN Administrator (4–16 karakter):
                    </label>
                    <div className="relative">
                      <input
                        type={showSetupPin ? 'text' : 'password'}
                        required
                        minLength={4}
                        maxLength={16}
                        value={setupPin}
                        onChange={e => setSetupPin(e.target.value)}
                        placeholder="Buat PIN rahasia..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-3 pr-9 py-2 text-white font-mono tracking-widest focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSetupPin(!showSetupPin)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        {showSetupPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Konfirmasi PIN Administrator:
                    </label>
                    <input
                      type={showSetupPin ? 'text' : 'password'}
                      required
                      minLength={4}
                      maxLength={16}
                      value={setupPinConfirm}
                      onChange={e => setSetupPinConfirm(e.target.value)}
                      placeholder="Ulangi PIN..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono tracking-widest focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* Initial Data Choice */}
                <div className="pt-1 space-y-2">
                  <label className="block text-xs text-slate-300 font-medium">
                    <Database className="w-3.5 h-3.5 inline mr-1 text-cyan-400" />
                    Pilihan Inisialisasi Data BOM &amp; Master Awal:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setSetupInitMode('template')}
                      className={`p-3 rounded-xl border text-left transition ${
                        setupInitMode === 'template'
                          ? 'bg-cyan-950/50 border-cyan-500 text-white ring-1 ring-cyan-500/40'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold text-white flex items-center justify-between">
                        <span>Template Data Pabrik Siap Pakai</span>
                        {setupInitMode === 'template' && (
                          <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Berisi contoh Bahan Baku, WIP, SKU, Mesin, Tangki, Operator &amp; Manajemen yang dapat langsung diedit.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSetupInitMode('blank')}
                      className={`p-3 rounded-xl border text-left transition ${
                        setupInitMode === 'blank'
                          ? 'bg-amber-950/40 border-amber-500 text-white ring-1 ring-amber-500/40'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold text-white flex items-center justify-between">
                        <span>Mulai Bersih (Master BOM Kosong)</span>
                        {setupInitMode === 'blank' && (
                          <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Mulai dari nol agar Administrator menginput sendiri seluruh BOM, Material, Operator &amp; Manajemen.
                      </p>
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmittingSetup || !setupUser}
                className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold rounded-2xl text-sm shadow-xl shadow-amber-600/20 transition active:scale-95 flex items-center justify-center space-x-2"
              >
                {isSubmittingSetup ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan Akun Admin &amp; Konfigurasi ke Cloud...</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
                    <span>Daftarkan Administrator &amp; Masuk ke Sistem</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* STATE 4: READY — REGULAR 3-ROLE LOGIN PORTAL */}
        {setupStatus === 'ready' && (
          <div className="space-y-4 sm:space-y-5">
            <div className="text-center max-w-2xl mx-auto space-y-1">
              <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono font-semibold mb-1">
                <Cloud className="w-3.5 h-3.5" />
                <span>
                  {isSyncingCloud
                    ? 'Menyinkronkan data dari Cloud...'
                    : isWorkspaceSyncedOnDevice
                    ? `Data Pabrik Tersinkronisasi (${state.master.skus.length} SKU • ${state.master.materials.length} Material)`
                    : `Terdaftar: ${cloudFactoryName || 'Cloud Workspace'} • Login Google untuk memuat data`}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
                Pilih Jenis Pengguna untuk Masuk
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Seluruh Master BOM, Resep, Line Produksi, serta hak akses Operator &amp; Manajemen tersinkronisasi aman di Cloud.
              </p>
            </div>

            {/* Role Selector Cards Grid */}
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
                    <h3 className="font-bold text-base text-white">Administrator</h3>
                    <p className="text-xs text-amber-400/90 font-mono mt-0.5">
                      Akses Penuh Modul MRP &amp; WMS
                    </p>
                    <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                      Mengelola Master BOM, resep formulasi, mesin, tangki WIP, serta hak akses Operator dan Management lintas perangkat.
                    </p>
                  </div>

                  {selectedRole === 'ADMINISTRATOR' ? (
                    <div className="pt-2 space-y-2.5">
                      <button
                        type="button"
                        onClick={() => handleGoogleCloudSignIn('ADMINISTRATOR')}
                        disabled={isGoogleLoading || isSyncingCloud}
                        className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-amber-600/20 transition flex items-center justify-center space-x-2 disabled:opacity-50 active:scale-95"
                      >
                        {isGoogleLoading || isSyncingCloud ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <KeyRound className="w-4 h-4" />
                        )}
                        <span>
                          {isGoogleLoading || isSyncingCloud
                            ? 'Memuat Data Cloud...'
                            : isWorkspaceSyncedOnDevice
                            ? 'Masuk dengan Google Admin'
                            : 'Login Google Admin & Muat Data Cloud'}
                        </span>
                      </button>

                      {isWorkspaceSyncedOnDevice && cloudAuthRole === 'ADMINISTRATOR' && (
                        <form onSubmit={handleAdminPinSubmit} className="pt-2 border-t border-slate-800 space-y-2">
                          <label className="block text-[11px] font-medium text-slate-300">
                            Atau Buka Cepat dengan PIN Admin:
                          </label>
                          <div className="relative">
                            <input
                              type={showPin ? 'text' : 'password'}
                              value={adminPinInput}
                              onChange={e => {
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
                          {pinError && <p className="text-[10px] text-rose-400">{pinError}</p>}
                          <button
                            type="submit"
                            className="w-full py-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-amber-300 font-semibold rounded-xl text-xs transition flex items-center justify-center space-x-1.5"
                          >
                            <span>Masuk via PIN Administrator</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      )}
                    </div>
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
                  Role: SUPER_ADMIN &amp; Cloud Master BOM
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
                    <h3 className="font-bold text-base text-white">Operator Produksi</h3>
                    <p className="text-xs text-cyan-400/90 font-mono mt-0.5">
                      Operasional Lini &amp; Gudang
                    </p>
                    <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                      Menjalankan Perintah Kerja Batch WIP, penerimaan bahan baku CK &amp; Wineroto, serta monitoring output line tanpa izin pengaturan Master.
                    </p>
                  </div>

                  {selectedRole === 'OPERATOR' ? (
                    isWorkspaceSyncedOnDevice && (cloudAuthRole === 'ADMINISTRATOR' || cloudAuthRole === 'OPERATOR') ? (
                      <form onSubmit={handleOperatorSubmit} className="pt-2 space-y-2.5">
                        {activeOperators.length > 0 ? (
                          <>
                            <div>
                              <label className="block text-[11px] font-medium text-slate-300 mb-1">
                                Pilih Operator Terdaftar ({activeOperators.length}):
                              </label>
                              <select
                                value={selectedOperatorId}
                                onChange={e => setSelectedOperatorId(e.target.value)}
                                required
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-500"
                              >
                                {activeOperators.map(op => (
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
                          </>
                        ) : (
                          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-amber-300">
                            Belum ada Operator aktif terdaftar. Hubungi Administrator untuk mendaftarkan akun Operator di menu Manajemen Pengguna.
                          </div>
                        )}
                      </form>
                    ) : (
                      <div className="pt-2 space-y-2.5">
                        <p className="text-[11px] text-slate-300 bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl">
                          Login dengan email Google Operator yang telah didaftarkan oleh Admin (atau login Admin untuk menghubungkan terminal produksi ini).
                        </p>
                        <button
                          type="button"
                          onClick={() => handleGoogleCloudSignIn('OPERATOR')}
                          disabled={isGoogleLoading || isSyncingCloud}
                          className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 disabled:opacity-50"
                        >
                          <KeyRound className="w-4 h-4" />
                          <span>Masuk Google &amp; Sinkronkan Cloud</span>
                        </button>
                      </div>
                    )
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
                  Role: OPERATOR (Perintah Kerja &amp; Penerimaan)
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
                    <h3 className="font-bold text-base text-white">Executive Management</h3>
                    <p className="text-xs text-indigo-400/90 font-mono mt-0.5">
                      Pemantauan Eksekutif (Read-Only)
                    </p>
                    <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                      Memantau ringkasan produksi per shift, level tangki WIP, dan saldo persediaan dari perangkat mana pun tanpa izin ubah data.
                    </p>
                  </div>

                  {selectedRole === 'MANAGEMENT' ? (
                    isWorkspaceSyncedOnDevice ? (
                      <form onSubmit={handleManagementSubmit} className="pt-2 space-y-2.5">
                        {state.registeredManagement.length > 0 ? (
                          <>
                            <div>
                              <label className="block text-[11px] font-medium text-slate-300 mb-1">
                                Pilih Profil Manajemen ({state.registeredManagement.length}):
                              </label>
                              <select
                                value={selectedManagementId}
                                onChange={e => setSelectedManagementId(e.target.value)}
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
                          </>
                        ) : (
                          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-amber-300">
                            Belum ada akun Management terdaftar. Administrator dapat menambahkannya di menu Manajemen Pengguna.
                          </div>
                        )}
                      </form>
                    ) : (
                      <div className="pt-2 space-y-2.5">
                        <p className="text-[11px] text-slate-300 bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl">
                          Masuk menggunakan akun Google email Management Anda yang sudah diberi izin melihat oleh Administrator.
                        </p>
                        <button
                          type="button"
                          onClick={() => handleGoogleCloudSignIn('MANAGEMENT')}
                          disabled={isGoogleLoading || isSyncingCloud}
                          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 disabled:opacity-50"
                        >
                          <KeyRound className="w-4 h-4" />
                          <span>Masuk Google Management (Cloud)</span>
                        </button>
                      </div>
                    )
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
                  Role: MANAGEMENT (Executive Read-Only)
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 max-w-6xl w-full mx-auto pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
        <div className="flex items-center space-x-2">
          <span>ProdTrack MES &amp; WMS Cloud</span>
          <span>•</span>
          <span>Multi-Device Firestore Sync</span>
        </div>
        <div className="flex items-center space-x-3 text-[11px] font-mono">
          <span>Zero-Trust Cloud Security</span>
          <span>•</span>
          <span>ISO 22000 / GMP Compliant</span>
        </div>
      </footer>
    </div>
  );
};
