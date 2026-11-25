import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  Lock,
  Unlock,
  KeyRound,
  AlertCircle,
  Eye,
  EyeOff,
  UserPlus,
  Trash2,
  Mail,
  CheckCircle2,
  LogOut,
  Sparkles,
  Loader2
} from 'lucide-react';
import { AdminGoogleUser, EffectiveRoleResolution } from '../types';
import { googleSignIn, clearWorkspaceDriveToken } from '../utils/googleWorkspace';
import {
  normalizeEmail,
  validatePasswordStrength,
  verifyPasswordSlow
} from '../utils/security';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  effectiveRole: EffectiveRoleResolution;
  adminPin: string;
  adminGoogleEmails?: string[];
  currentAdminUser?: AdminGoogleUser | null;
  onLogin: (googleUser?: AdminGoogleUser) => void;
  onLogout: () => void;
  onChangePin: (newPin: string) => void;
  onAddAdminEmail: (email: string) => void;
  onRemoveAdminEmail: (email: string) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  onClose,
  effectiveRole,
  adminPin,
  adminGoogleEmails = [],
  currentAdminUser,
  onLogin,
  onLogout,
  onChangePin,
  onAddAdminEmail,
  onRemoveAdminEmail,
  showToast
}) => {
  const [activeTab, setActiveTab] = useState<'GOOGLE' | 'PIN'>('GOOGLE');
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [newPinInput, setNewPinInput] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setPinInput('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutUntil > Date.now()) {
      const rem = Math.ceil((lockoutUntil - Date.now()) / 1000);
      showToast(`Terlalu banyak percobaan gagal. Coba lagi dalam ${rem} detik.`, true);
      return;
    }

    const isMatched = await verifyPasswordSlow(pinInput, adminPin);
    if (isMatched) {
      setFailedAttempts(0);
      setLockoutUntil(0);
      onLogin();
      setPinInput('');
      onClose();
      if (effectiveRole.hasRegisteredGoogleAdminEmail) {
        showToast('Akses Administrator Diizinkan (Autentikasi PIN + Google Admin)');
      } else {
        showToast('Mode PIN Lokal aktif — perubahan Master hanya tersimpan lokal dan tidak ke Cloud');
      }
    } else {
      const nextFails = failedAttempts + 1;
      setFailedAttempts(nextFails);
      if (nextFails >= 5) {
        setLockoutUntil(Date.now() + 60000);
        showToast('Terlalu banyak percobaan gagal. Dikunci sementara 60 detik.', true);
      } else {
        showToast('PIN atau kredensial tidak valid', true);
      }
    }
  };

  const handleKeypadPress = (val: string) => {
    if (val === 'CLEAR') {
      setPinInput('');
    } else if (val === 'BACK') {
      setPinInput(prev => prev.slice(0, -1));
    } else {
      if (pinInput.length < 32) {
        setPinInput(prev => prev + val);
      }
    }
  };

  const handleSaveNewPin = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validatePasswordStrength(newPinInput);
    if (!check.isValid) {
      showToast(check.message || 'PIN minimal 8 karakter dan tidak boleh umum.', true);
      return;
    }
    await onChangePin(newPinInput.trim());
    setIsChangingPin(false);
    setNewPinInput('');
    showToast('PIN Administrator berhasil diperbarui');
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsGoogleLoading(true);
      const res = await googleSignIn();
      if (!res) return;

      const userEmail = normalizeEmail(res.user.email || '');
      const allowedList = adminGoogleEmails.map(e => normalizeEmail(e));

      const isRegistered = allowedList.includes(userEmail);

      const adminUser: AdminGoogleUser = {
        email: userEmail,
        displayName: res.user.displayName || userEmail.split('@')[0],
        photoURL: res.user.photoURL || undefined,
        registeredAt: new Date().toISOString(),
        role: isRegistered && allowedList[0] === userEmail ? 'SUPER_ADMIN' : 'ADMIN'
      };

      if (isRegistered) {
        onLogin(adminUser);
        showToast(`Selamat datang Administrator: ${adminUser.displayName || userEmail}`);
        onClose();
      } else {
        showToast(
          `Akun Google (${userEmail}) belum terdaftar pada daftar Administrator workspace ini.`,
          true
        );
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal login dengan akun Google', true);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleAddEmail = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = newAdminEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      showToast('Masukkan alamat email Google yang valid', true);
      return;
    }

    if (adminGoogleEmails.map(e => e.toLowerCase()).includes(cleanEmail)) {
      showToast('Email administrator ini sudah terdaftar', true);
      return;
    }

    onAddAdminEmail(cleanEmail);
    setNewAdminEmail('');
    showToast(`Email ${cleanEmail} berhasil didaftarkan sebagai Administrator`);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-surface border border-border-subtle rounded-2xl w-full max-w-md p-5 shadow-2xl relative space-y-4 max-h-[92vh] overflow-y-auto no-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-amber-500/10 border border-amber-500/20 text-ink-amber rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-ink-primary">
                {effectiveRole.isAdmin ? 'Portal Administrator Aktif' : 'Autentikasi Administrator'}
              </h3>
              <p className="text-[10px] text-ink-secondary">
                Pendaftaran & login akun Google & PIN darurat
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-ink-secondary hover:text-ink-primary rounded-lg bg-elevated hover:bg-accent transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {effectiveRole.isAdmin ? (
          /* Logged-In Admin Panel */
          <div className="space-y-4 text-xs">
            {/* Offline PIN Local Mode Yellow Warning Badge */}
            {(effectiveRole.isOfflinePinAdmin || !effectiveRole.canWriteCloudMaster) && (
              <div className="p-3 bg-amber-500/15 border border-amber-400/50 rounded-xl space-y-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-400/20 border border-amber-400/60 text-ink-amber font-bold text-[11px]">
                  <AlertCircle className="w-3.5 h-3.5 text-ink-amber shrink-0" />
                  <span>Mode PIN Lokal (Perubahan Master Tidak Tersimpan ke Cloud)</span>
                </div>
                <p className="text-[11px] text-amber-100/90 leading-relaxed">
                  Anda masuk menggunakan PIN lokal tanpa email Google Admin yang terdaftar di konfigurasi akses workspace. Perubahan Master BOM hanya tersimpan di perangkat ini (<span className="font-mono">canWriteCloudMaster: false</span>).
                </p>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleLoading}
                  className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-[11px] flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
                >
                  {isGoogleLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5" />
                  )}
                  <span>Login dengan Google Admin Terdaftar untuk Sinkron Cloud</span>
                </button>
              </div>
            )}

            {/* Active Admin Banner */}
            {effectiveRole.canWriteCloudMaster ? (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-ink-emerald flex items-start space-x-2.5">
                <Unlock className="w-4 h-4 text-ink-emerald shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-semibold block text-ink-primary text-xs">
                    Hak Akses Administrator Penuh Aktif
                  </span>
                  <span className="text-[11px] text-ink-emerald block">
                    {currentAdminUser ? (
                      <>
                        Login via Google:{' '}
                        <strong className="text-ink-primary font-mono">{currentAdminUser.email}</strong>
                      </>
                    ) : (
                      `Terverifikasi Google Cloud Admin (${effectiveRole.activeGoogleEmail || 'Workspace Admin'})`
                    )}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-elevated border border-border-strong rounded-xl text-ink-secondary flex items-start space-x-2.5">
                <KeyRound className="w-4 h-4 text-ink-amber shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-semibold block text-ink-primary text-xs">
                    Login via PIN Kredensial Sistem Workshop (Lokal)
                  </span>
                  <span className="text-[11px] text-ink-secondary block">
                    Role aktif: <strong className="font-mono text-ink-amber">{effectiveRole.role}</strong>
                  </span>
                </div>
              </div>
            )}

            {/* Google Admin User Profile if logged in */}
            {currentAdminUser && (
              <div className="bg-elevated border border-border-strong rounded-xl p-3 flex items-center space-x-3">
                {currentAdminUser.photoURL ? (
                  <img
                    src={currentAdminUser.photoURL}
                    alt={currentAdminUser.displayName}
                    className="w-10 h-10 rounded-full border border-cyan-400/40 object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-brand font-bold">
                    {currentAdminUser.email[0].toUpperCase()}
                  </div>
                )}
                <div className="truncate flex-1">
                  <div className="font-semibold text-ink-primary text-xs truncate">
                    {currentAdminUser.displayName || currentAdminUser.email}
                  </div>
                  <div className="text-[11px] font-mono text-brand truncate">
                    {currentAdminUser.email}
                  </div>
                  <span className="inline-block mt-0.5 text-[9px] px-1.5 py-0.2 bg-amber-500/20 text-ink-amber rounded font-semibold">
                    {currentAdminUser.role || 'ADMINISTRATOR'}
                  </span>
                </div>
              </div>
            )}

            {/* Management Section: Pendaftaran Administrator Google */}
            <div className="bg-elevated border border-border-subtle rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-ink-primary text-xs flex items-center space-x-1.5">
                  <Mail className="w-3.5 h-3.5 text-brand" />
                  <span>Daftar Email Administrator Google</span>
                </h4>
                <span className="text-[10px] text-ink-secondary font-mono">
                  {adminGoogleEmails.length} terdaftar
                </span>
              </div>

              {/* Form tambah email admin */}
              <form onSubmit={handleAddEmail} className="flex space-x-1.5 bg-canvas border border-border-subtle rounded-xl p-2">
                <input
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="admin-baru@gmail.com"
                  className="flex-1 bg-surface border border-border-strong rounded-xl px-2.5 py-1.5 text-xs text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent-primary"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold flex items-center space-x-1 shrink-0"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Daftarkan</span>
                </button>
              </form>

              {/* List of registered emails */}
              <div className="space-y-1.5 max-h-36 overflow-y-auto no-scrollbar pt-1">
                {adminGoogleEmails.map((email, idx) => {
                  const isSuper = idx === 0 || normalizeEmail(email) === normalizeEmail(currentAdminUser?.email || '');
                  return (
                    <div
                      key={email}
                      className="flex items-center justify-between bg-surface border border-border-subtle px-2.5 py-1.5 rounded-lg text-xs"
                    >
                      <div className="truncate mr-2 flex items-center space-x-1.5">
                        <span className="font-mono text-ink-primary truncate">{email}</span>
                        {idx === 0 && (
                          <span className="text-[9px] px-1 py-0.2 bg-amber-500/20 text-ink-amber rounded font-semibold shrink-0">
                            Super Admin
                          </span>
                        )}
                      </div>
                      {!isSuper && (
                        <button
                          type="button"
                          onClick={() => onRemoveAdminEmail(email)}
                          className="text-ink-rose hover:text-ink-rose p-1 rounded"
                          title="Hapus hak akses administrator"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Change Offline PIN */}
            {isChangingPin ? (
              <form onSubmit={handleSaveNewPin} className="space-y-2 bg-elevated p-3 rounded-xl border border-border-strong">
                <label className="block text-[11px] font-medium text-ink-secondary">
                  Masukkan PIN / Password Baru (Min. 8 Karakter)
                </label>
                <input
                  type="password"
                  minLength={8}
                  maxLength={128}
                  value={newPinInput}
                  onChange={(e) => setNewPinInput(e.target.value)}
                  placeholder="PIN baru (min. 8 karakter unik)"
                  className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-sm text-ink-primary focus:outline-none focus:border-accent-primary"
                />
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsChangingPin(false)}
                    className="w-1/2 py-1.5 bg-elevated text-ink-secondary rounded-xl text-xs"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl text-xs"
                  >
                    Simpan PIN
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setIsChangingPin(true)}
                className="w-full py-2 bg-elevated hover:bg-accent text-ink-secondary rounded-xl text-xs font-medium flex items-center justify-center space-x-1.5 border border-border-strong"
              >
                <KeyRound className="w-3.5 h-3.5 text-ink-secondary" />
                <span>Ganti PIN Offline Administrator</span>
              </button>
            )}

            {/* Logout Button */}
            <button
              onClick={() => {
                clearWorkspaceDriveToken();
                onLogout();
                onClose();
                showToast('Berhasil keluar dari mode Administrator');
              }}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center justify-center space-x-2 transition border border-rose-700 shadow-sm active:scale-95"
            >
              <Lock className="w-4 h-4 text-white" />
              <span className="text-white font-bold">Kunci & Keluar Mode Administrator</span>
            </button>
          </div>
        ) : (
          /* Login Form (Google OAuth vs PIN Keypad) */
          <div className="space-y-4">
            {/* Tabs */}
            <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-300">
              <button
                type="button"
                onClick={() => setActiveTab('GOOGLE')}
                className={`py-1.5 text-xs font-bold rounded-lg flex items-center justify-center space-x-1.5 transition ${
                  activeTab === 'GOOGLE'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-900 font-semibold'
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Akun Google</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('PIN')}
                className={`py-1.5 text-xs font-bold rounded-lg flex items-center justify-center space-x-1.5 transition ${
                  activeTab === 'PIN'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-900 font-semibold'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>PIN Workshop</span>
              </button>
            </div>

            {activeTab === 'GOOGLE' && (
              <div className="space-y-3.5 py-1">
                <div className="bg-elevated border border-border-strong rounded-xl p-3 text-center space-y-2">
                  <p className="text-xs text-ink-secondary">
                    Masuk menggunakan akun email Google Anda yang telah didaftarkan sebagai Administrator pada workspace pabrik ini.
                  </p>
                </div>

                {/* Google Sign In Button */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleLoading}
                  className="w-full py-3 px-4 bg-white hover:bg-slate-100 text-slate-800 font-semibold rounded-xl text-xs flex items-center justify-center space-x-2.5 shadow-lg transition active:scale-95 disabled:opacity-50"
                >
                  {isGoogleLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                  )}
                  <span>Lanjutkan dengan Akun Google</span>
                </button>

                <div className="text-[10px] text-ink-muted text-center">
                  Otentikasi aman berbasis Google Workspace OAuth & Firebase Auth.
                </div>
              </div>
            )}

            {activeTab === 'PIN' && (
              <form onSubmit={handlePinSubmit} className="space-y-4 bg-canvas border border-border-subtle rounded-2xl p-3.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-ink-secondary">
                      PIN Workshop Administrator
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      type={showPin ? 'text' : 'password'}
                      id="adminPinInput"
                      autoComplete="off"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      required
                      placeholder="Masukkan PIN Administrator"
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2.5 text-center text-lg font-mono tracking-widest text-ink-primary focus:outline-none focus:border-accent-primary pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-ink-secondary hover:text-ink-primary"
                    >
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Quick Touch Keypad */}
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        if (key === 'C') handleKeypadPress('CLEAR');
                        else if (key === '⌫') handleKeypadPress('BACK');
                        else handleKeypadPress(key);
                      }}
                      className="py-2.5 rounded-xl bg-elevated hover:bg-accent text-ink-primary text-sm font-semibold font-mono active:scale-95 transition border border-border-strong"
                    >
                      {key}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl text-xs shadow-lg shadow-cyan-600/20 transition active:scale-95"
                >
                  Masuk dengan PIN Workshop
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
