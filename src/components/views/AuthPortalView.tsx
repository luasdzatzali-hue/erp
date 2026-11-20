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
  Lock,
  Copy,
  RefreshCw,
  X
} from 'lucide-react';
import { AppState, UserRole } from '../../types';
import { getCurrentShift, ShiftNumber } from '../../utils/shifts';
import {
  AuthErrorDetail,
  formatGoogleAuthError,
  signInWithGoogleAuth,
  startGoogleRedirectSignIn
} from '../../utils/firebaseSync';
import {
  sanitizeTextInput,
  validatePasswordStrength,
  verifyPasswordSlow
} from '../../utils/security';

interface AuthPortalViewProps {
  state: AppState;
  theme?: 'midnight' | 'daylight' | 'light' | 'dark';
  onToggleTheme?: () => void;
  setupStatus: 'checking' | 'needs_setup' | 'ready' | 'error';
  cloudFactoryName?: string;
  firebaseUser: User | null;
  cloudAuthRole?: UserRole | null;
  isSyncingCloud: boolean;
  authError?: AuthErrorDetail | null;
  onClearAuthError?: () => void;
  onRetryCheckSetup: () => void;
  onCompleteFirstAdminSetup: (data: {
    user: User;
    factoryName: string;
    adminName: string;
    adminPin: string;
    initMode: 'template' | 'blank';
  }) => Promise<void>;
  onGoogleCloudLogin: (
    intendedRole?: UserRole,
    options?: { forceAccountSelect?: boolean; useRedirect?: boolean }
  ) => Promise<void>;
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
  authError,
  onClearAuthError,
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
  const [setupAuthError, setSetupAuthError] = useState<AuthErrorDetail | null>(null);

  // Auth Mode: 'login' vs 'signup' when setupStatus is ready
  const [authMode, setAuthMode] = useState<'login' | 'signup'>(() => {
    try {
      const saved = sessionStorage.getItem('prodtrack_auth_mode');
      if (saved === 'signup') {
        sessionStorage.removeItem('prodtrack_auth_mode');
        return 'signup';
      }
    } catch {
      // ignore
    }
    return 'login';
  });

  // Rate limiting & lockout protection state
  const [failedLoginAttempts, setFailedLoginAttempts] = useState<number>(0);
  const [lockoutUntil, setLockoutUntil] = useState<number>(0);
  const [lockoutRemainingSecs, setLockoutRemainingSecs] = useState<number>(0);

  useEffect(() => {
    if (lockoutUntil <= Date.now()) {
      setLockoutRemainingSecs(0);
      return;
    }
    const timer = setInterval(() => {
      const rem = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (rem <= 0) {
        setLockoutUntil(0);
        setLockoutRemainingSecs(0);
        clearInterval(timer);
      } else {
        setLockoutRemainingSecs(rem);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutUntil]);

  // First-time / Multi-tenant Admin Setup Wizard state
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
    } else {
      setSetupUser(null);
      setSetupAdminName('');
      setSetupPin('');
      setSetupPinConfirm('');
      setAdminPinInput('');
      setPinError('');
      setSetupAuthError(null);
      setIsGoogleLoading(false);
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
  const handleConnectGoogleForSetup = async (useRedirect = false) => {
    setSetupAuthError(null);
    try {
      setIsGoogleLoading(true);
      if (useRedirect) {
        try {
          sessionStorage.setItem('prodtrack_auth_mode', 'signup');
        } catch {
          // ignore
        }
        await startGoogleRedirectSignIn('SETUP');
        return;
      }
      const user = await signInWithGoogleAuth(true);
      if (!user) return;
      setSetupUser(user);
      setSetupAdminName(prev => prev.trim() || user.displayName || user.email?.split('@')[0] || 'Administrator');
      showToast(`Akun Google terhubung: ${user.email}`);
    } catch (err: any) {
      const detail = (err as any)?.authDetail || formatGoogleAuthError(err);
      setSetupAuthError(detail);
      showToast(detail.message || 'Gagal menghubungkan akun Google', true);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Setup Wizard: Submit Admin Registration (Initial or Isolated Multi-Tenant Signup)
  const handleSetupWizardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupUser) {
      showToast('Hubungkan akun Google Administrator terlebih dahulu pada Langkah 1.', true);
      return;
    }
    const cleanFactory = sanitizeTextInput(setupFactoryName, 120);
    const cleanAdminName = sanitizeTextInput(setupAdminName, 120);
    if (!cleanFactory) {
      showToast('Harap isi Nama Pabrik / Perusahaan.', true);
      return;
    }
    if (!cleanAdminName) {
      showToast('Harap isi Nama Lengkap Administrator.', true);
      return;
    }
    const pwdCheck = validatePasswordStrength(setupPin);
    if (!pwdCheck.isValid) {
      showToast(pwdCheck.message || 'Password/PIN keamanan tidak memenuhi standar.', true);
      return;
    }
    if (setupPin.trim() !== setupPinConfirm.trim()) {
      showToast('Konfirmasi Password/PIN tidak cocok.', true);
      return;
    }

    try {
      setIsSubmittingSetup(true);
      await onCompleteFirstAdminSetup({
        user: setupUser,
        factoryName: cleanFactory,
        adminName: cleanAdminName,
        adminPin: setupPin.trim(),
        initMode: setupInitMode
      });
    } catch (err: any) {
      showToast(err?.message || 'Gagal mendaftarkan Administrator ke Cloud.', true);
    } finally {
      setIsSubmittingSetup(false);
    }
  };

  // Admin PIN login (only allowed when device has already synced the workspace from Cloud)
  const handleAdminPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutRemainingSecs > 0) {
      showToast(`Terlalu banyak percobaan gagal. Harap tunggu ${lockoutRemainingSecs} detik sebelum mencoba kembali.`, true);
      return;
    }
    if (!isWorkspaceSyncedOnDevice) {
      showToast('Silakan masuk dengan Akun Google Admin terlebih dahulu untuk menyinkronkan data Cloud ke perangkat ini.', true);
      return;
    }
    const isMatched = await verifyPasswordSlow(adminPinInput, state.adminPin);
    if (isMatched) {
      setFailedLoginAttempts(0);
      setPinError('');
      onLoginSuccess('ADMINISTRATOR', {
        id: firebaseUser?.uid || 'admin_root',
        name: state.currentAdminUser?.displayName || firebaseUser?.displayName || 'Administrator MES & BOM',
        email: firebaseUser?.email || state.adminGoogleEmails?.[0] || '',
        subtitle: `Akses Penuh: Master BOM, Mesin, Tangki, User Access & MRP (${state.factoryName || 'ProdTrack'})`
      });
      showToast('Berhasil masuk sebagai Administrator (Akses Penuh MRP & WMS)');
    } else {
      const nextFail = failedLoginAttempts + 1;
      setFailedLoginAttempts(nextFail);
      if (nextFail >= 5) {
        const lockoutTime = Date.now() + 60000;
        setLockoutUntil(lockoutTime);
        setLockoutRemainingSecs(60);
        setPinError('Terlalu banyak percobaan gagal. Akun dikunci sementara selama 60 detik.');
        showToast('Keamanan Aktif: Login diblokir sementara selama 60 detik akibat percobaan gagal berulang.', true);
      } else {
        setPinError('Email atau PIN tidak valid. Silakan periksa kembali dan coba lagi.');
        showToast('Email atau PIN salah', true);
      }
    }
  };

  // Google Cloud sign in for Admin / Operator / Management
  const handleGoogleCloudSignIn = async (
    intendedRole?: UserRole,
    options?: { forceAccountSelect?: boolean; useRedirect?: boolean }
  ) => {
    try {
      setIsGoogleLoading(true);
      await onGoogleCloudLogin(intendedRole, options);
    } catch (err: any) {
      showToast(err?.message || 'Gagal masuk via Google Cloud', true);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleCopyHostname = async (domain: string) => {
    try {
      await navigator.clipboard.writeText(domain);
      showToast(`Domain "${domain}" disalin ke clipboard`);
    } catch {
      showToast(`Salin manual domain: ${domain}`);
    }
  };

  const renderAuthErrorBanner = (
    detail: AuthErrorDetail | null | undefined,
    onDismiss?: () => void,
    redirectRole?: UserRole | 'SETUP'
  ) => {
    if (!detail) return null;
    return (
      <div className="max-w-2xl mx-auto w-full bg-rose-950/60 border border-rose-500/50 rounded-2xl p-3.5 text-xs text-rose-100 space-y-2.5 shadow-lg">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-rose-200">
                Autentikasi Google Memerlukan Tindakan
                {detail.code ? ` (${detail.code})` : ''}
              </div>
              <p className="text-[11px] text-rose-100/90 leading-relaxed">{detail.message}</p>
            </div>
          </div>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="p-1 rounded-lg text-rose-300 hover:text-white hover:bg-rose-900/50 transition shrink-0"
              title="Tutup pesan"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {detail.domain && (
          <div className="bg-slate-950/80 border border-rose-500/30 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="text-[10px] text-slate-400 uppercase font-mono">
                Tambahkan Domain Ini di Firebase Authorized Domains:
              </div>
              <div className="text-xs font-mono font-bold text-amber-300">{detail.domain}</div>
            </div>
            <button
              type="button"
              onClick={() => handleCopyHostname(detail.domain!)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-semibold flex items-center space-x-1 transition"
            >
              <Copy className="w-3 h-3" />
              <span>Salin Domain</span>
            </button>
          </div>
        )}

        {detail.showRedirectOption && redirectRole && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <button
              type="button"
              disabled={isGoogleLoading || isSyncingCloud}
              onClick={() => {
                if (redirectRole === 'SETUP') {
                  handleConnectGoogleForSetup(true);
                } else {
                  handleGoogleCloudSignIn(redirectRole, { useRedirect: true });
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold flex items-center space-x-1.5 transition disabled:opacity-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Login Google via Redirect (Alternatif Tanpa Popup)</span>
            </button>
          </div>
        )}
      </div>
    );
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
                      onClick={() => handleConnectGoogleForSetup(false)}
                      disabled={isGoogleLoading}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold transition"
                    >
                      Ganti Akun Google
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => handleConnectGoogleForSetup(false)}
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
                    <button
                      type="button"
                      onClick={() => handleConnectGoogleForSetup(true)}
                      disabled={isGoogleLoading}
                      className="w-full py-1.5 text-[11px] text-cyan-300 hover:text-cyan-200 underline transition disabled:opacity-50"
                    >
                      Popup terblokir? Hubungkan via Redirect
                    </button>
                  </div>
                )}

                {renderAuthErrorBanner(setupAuthError || authError, () => {
                  setSetupAuthError(null);
                  onClearAuthError?.();
                }, 'SETUP')}
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
                      Buat PIN / Password Administrator (Min. 8 karakter):
                    </label>
                    <div className="relative">
                      <input
                        type={showSetupPin ? 'text' : 'password'}
                        required
                        minLength={8}
                        maxLength={128}
                        value={setupPin}
                        onChange={e => setSetupPin(e.target.value)}
                        placeholder="Minimal 8 karakter unik..."
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
                      Konfirmasi PIN / Password Administrator:
                    </label>
                    <input
                      type={showSetupPin ? 'text' : 'password'}
                      required
                      minLength={8}
                      maxLength={128}
                      value={setupPinConfirm}
                      onChange={e => setSetupPinConfirm(e.target.value)}
                      placeholder="Ulangi PIN / Password..."
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

        {/* STATE 4: READY — LOGIN / SIGNUP PORTAL SWITCHER */}
        {setupStatus === 'ready' && (
          <div className="space-y-5">
            {/* Top Auth Mode Tabs (Login vs Sign Up) */}
            <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 p-1.5 rounded-2xl flex items-center shadow-lg">
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${
                  authMode === 'login'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Masuk (Login)</span>
              </button>

              <button
                type="button"
                onClick={() => setAuthMode('signup')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${
                  authMode === 'signup'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Daftar Akun Baru (Sign Up)</span>
              </button>
            </div>

            {authMode === 'signup' ? (
              <div className="max-w-2xl mx-auto w-full space-y-4">
                <div className="text-center space-y-1">
                  <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                    Pendaftaran Akun Administrator &amp; Pabrik Baru
                  </h2>
                  <p className="text-xs text-slate-400">
                    Buat akun administrator baru dan workspace pabrik terisolasi dengan BOM mandiri.
                  </p>
                </div>

                <form
                  onSubmit={handleSetupWizardSubmit}
                  className="bg-slate-900/90 border border-amber-500/40 rounded-3xl p-5 sm:p-7 space-y-5 shadow-2xl"
                >
                  {/* Step 1: Google Auth Connection */}
                  <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center space-x-2.5">
                      <span className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0">
                        1
                      </span>
                      <div>
                        <h3 className="text-sm font-bold text-white">
                          Hubungkan Akun Google untuk Pendaftaran
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Identitas akun Google untuk autentikasi aman.
                        </p>
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
                          onClick={() => handleConnectGoogleForSetup(false)}
                          disabled={isGoogleLoading}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold transition"
                        >
                          Ganti Akun Google
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => handleConnectGoogleForSetup(false)}
                          disabled={isGoogleLoading}
                          className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 shadow-lg transition active:scale-95 disabled:opacity-50"
                        >
                          {isGoogleLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <KeyRound className="w-4 h-4" />
                          )}
                          <span>Hubungkan Akun Google Administrator</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConnectGoogleForSetup(true)}
                          disabled={isGoogleLoading}
                          className="w-full py-1.5 text-[11px] text-cyan-300 hover:text-cyan-200 underline transition disabled:opacity-50"
                        >
                          Popup terblokir? Hubungkan via Redirect
                        </button>
                      </div>
                    )}

                    {renderAuthErrorBanner(setupAuthError, () => setSetupAuthError(null), 'SETUP')}
                  </div>

                  {/* Step 2: Factory & Security Profile */}
                  <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3.5">
                    <div className="flex items-center space-x-2.5">
                      <span className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0">
                        2
                      </span>
                      <div>
                        <h3 className="text-sm font-bold text-white">
                          Identitas Pabrik, PIN Keamanan &amp; Pilihan BOM Awal
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Data BOM, Operator, dan Management terisolasi khusus untuk akun pabrik Anda.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-slate-300 font-medium mb-1">Nama Pabrik / Perusahaan:</label>
                        <input
                          type="text"
                          required
                          maxLength={120}
                          value={setupFactoryName}
                          onChange={e => setSetupFactoryName(e.target.value)}
                          placeholder="cth: PT Manufaktur Baru Nusantara"
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-300 font-medium mb-1">Nama Administrator:</label>
                        <input
                          type="text"
                          required
                          maxLength={120}
                          value={setupAdminName}
                          onChange={e => setSetupAdminName(e.target.value)}
                          placeholder="Nama lengkap..."
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-300 font-medium mb-1">PIN / Password (Min. 8 Karakter):</label>
                        <div className="relative">
                          <input
                            type={showSetupPin ? 'text' : 'password'}
                            required
                            minLength={8}
                            maxLength={128}
                            value={setupPin}
                            onChange={e => setSetupPin(e.target.value)}
                            placeholder="Min. 8 karakter unik..."
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-3 pr-9 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
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
                        <label className="block text-slate-300 font-medium mb-1">Konfirmasi PIN / Password:</label>
                        <input
                          type={showSetupPin ? 'text' : 'password'}
                          required
                          minLength={8}
                          maxLength={128}
                          value={setupPinConfirm}
                          onChange={e => setSetupPinConfirm(e.target.value)}
                          placeholder="Ulangi PIN / Password..."
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>

                    {/* Initial Data Choice for isolated tenant */}
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
                            Berisi contoh Bahan Baku, WIP, SKU, Mesin, Tangki yang dapat disesuaikan.
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
                            Mulai dari nol agar Anda menginput sendiri BOM, Operator &amp; Management.
                          </p>
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingSetup || !setupUser}
                    className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold rounded-2xl text-sm shadow-xl transition active:scale-95 flex items-center justify-center space-x-2"
                  >
                    {isSubmittingSetup ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Mendaftarkan Akun &amp; Workspace Baru...</span>
                      </>
                    ) : (
                      <>
                        <Shield className="w-4 h-4" />
                        <span>Buat Akun &amp; Pabrik Baru (Sign Up)</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => setAuthMode('login')}
                      className="text-xs text-cyan-400 hover:text-cyan-300 underline font-medium"
                    >
                      Sudah punya akun? Masuk ke sistem (Login)
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="space-y-4 sm:space-y-5">
                <div className="text-center max-w-2xl mx-auto space-y-1">
                  <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono font-semibold mb-1">
                    <Cloud className="w-3.5 h-3.5" />
                    <span>
                      {isSyncingCloud
                        ? 'Menyinkronkan data dari Cloud...'
                        : isWorkspaceSyncedOnDevice
                        ? `Data Pabrik Tersinkronisasi (${state.master.skus.length} SKU • ${state.master.materials.length} Material)`
                        : 'Pilih Peran & Masuk dengan Akun Google Anda (Atau Daftar Akun Baru)'}
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
                    Pilih Jenis Pengguna untuk Masuk
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400">
                    Seluruh Master BOM, Resep, Line Produksi, serta hak akses Operator &amp; Manajemen tersinkronisasi aman di Cloud.
                  </p>
                </div>

                {renderAuthErrorBanner(authError, onClearAuthError, selectedRole)}

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
                    <div className="pt-2 space-y-2.5" onClick={e => e.stopPropagation()}>
                      {isWorkspaceSyncedOnDevice && cloudAuthRole === 'ADMINISTRATOR' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleGoogleCloudSignIn('ADMINISTRATOR')}
                            disabled={isGoogleLoading || isSyncingCloud}
                            className="w-full py-2.5 px-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-amber-600/20 transition flex items-center justify-center space-x-2 disabled:opacity-50 active:scale-95"
                          >
                            {isGoogleLoading || isSyncingCloud ? (
                              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                            )}
                            <span className="truncate">
                              {isGoogleLoading || isSyncingCloud
                                ? 'Memuat Data Cloud...'
                                : `Masuk Kembali (${firebaseUser?.email || 'Admin'})`}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleGoogleCloudSignIn('ADMINISTRATOR', { forceAccountSelect: true })
                            }
                            disabled={isGoogleLoading || isSyncingCloud}
                            className="w-full py-1.5 px-3 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-xl text-[11px] font-medium transition disabled:opacity-50"
                          >
                            Ganti Akun Google Admin Lain
                          </button>
                        </>
                      ) : (
                        <>
                          {firebaseUser && (
                            <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-300">
                              Terhubung sebagai{' '}
                              <span className="font-mono text-amber-300 font-semibold">
                                {firebaseUser.email}
                              </span>
                              {cloudAuthRole
                                ? ` (${cloudAuthRole}). Klik tombol di bawah untuk ganti ke akun Admin.`
                                : ' (belum terdaftar sebagai Admin).'}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              handleGoogleCloudSignIn('ADMINISTRATOR', {
                                forceAccountSelect: Boolean(firebaseUser)
                              })
                            }
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
                                : firebaseUser
                                ? 'Ganti / Login Google Admin'
                                : 'Login Google Admin & Muat Data Cloud'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleGoogleCloudSignIn('ADMINISTRATOR', { useRedirect: true })
                            }
                            disabled={isGoogleLoading || isSyncingCloud}
                            className="w-full py-1 text-[11px] text-amber-300/90 hover:text-amber-200 underline transition disabled:opacity-50"
                          >
                            Popup gagal? Login via Redirect (Vercel/Mobile)
                          </button>
                        </>
                      )}

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
                      <div className="pt-2 space-y-2" onClick={e => e.stopPropagation()}>
                        <p className="text-[11px] text-slate-300 bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl">
                          Login dengan email Google Operator yang telah didaftarkan oleh Admin (atau login Admin untuk menghubungkan terminal produksi ini).
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            handleGoogleCloudSignIn('OPERATOR', {
                              forceAccountSelect: Boolean(firebaseUser)
                            })
                          }
                          disabled={isGoogleLoading || isSyncingCloud}
                          className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 disabled:opacity-50"
                        >
                          <KeyRound className="w-4 h-4" />
                          <span>
                            {firebaseUser
                              ? 'Ganti / Masuk Google Operator'
                              : 'Masuk Google & Sinkronkan Cloud'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleGoogleCloudSignIn('OPERATOR', { useRedirect: true })
                          }
                          disabled={isGoogleLoading || isSyncingCloud}
                          className="w-full py-1 text-[11px] text-cyan-300/90 hover:text-cyan-200 underline transition disabled:opacity-50"
                        >
                          Popup gagal? Login via Redirect
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
                    isWorkspaceSyncedOnDevice && Boolean(cloudAuthRole) ? (
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
                      <div className="pt-2 space-y-2" onClick={e => e.stopPropagation()}>
                        <p className="text-[11px] text-slate-300 bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl">
                          Masuk menggunakan akun Google email Management Anda yang sudah diberi izin melihat oleh Administrator.
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            handleGoogleCloudSignIn('MANAGEMENT', {
                              forceAccountSelect: Boolean(firebaseUser)
                            })
                          }
                          disabled={isGoogleLoading || isSyncingCloud}
                          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 disabled:opacity-50"
                        >
                          <KeyRound className="w-4 h-4" />
                          <span>
                            {firebaseUser
                              ? 'Ganti / Masuk Google Management'
                              : 'Masuk Google Management (Cloud)'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleGoogleCloudSignIn('MANAGEMENT', { useRedirect: true })
                          }
                          disabled={isGoogleLoading || isSyncingCloud}
                          className="w-full py-1 text-[11px] text-indigo-300/90 hover:text-indigo-200 underline transition disabled:opacity-50"
                        >
                          Popup gagal? Login via Redirect
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

                {/* Sign Up CTA Banner for New Users / Other Companies */}
                <div className="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                  <div className="flex items-center space-x-3 text-center sm:text-left">
                    <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0 hidden sm:flex">
                      <Factory className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-white">
                        Pabrik / Administrator Baru yang Belum Terdaftar?
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Daftar akun Administrator baru untuk membuat workspace terisolasi dengan Master BOM, akun Operator, &amp; Manajemen milik Anda sendiri.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signup');
                      setPinError('');
                    }}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs whitespace-nowrap flex items-center space-x-1.5 shadow-md transition active:scale-95 shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Daftar Akun Baru (Sign Up)</span>
                  </button>
                </div>
              </div>
            )}
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
