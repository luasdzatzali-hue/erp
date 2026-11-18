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
import { AdminGoogleUser } from '../types';
import { googleSignIn, clearWorkspaceDriveToken } from '../utils/googleWorkspace';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
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
  isAdmin,
  adminPin,
  adminGoogleEmails = ['luasdzatzali@gmail.com'],
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

  useEffect(() => {
    if (isOpen) {
      setPinInput('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === adminPin) {
      onLogin();
      setPinInput('');
      onClose();
      showToast('Akses Administrator Diizinkan (Autentikasi PIN)');
    } else {
      showToast('PIN Administrator Salah', true);
    }
  };

  const handleKeypadPress = (val: string) => {
    if (val === 'CLEAR') {
      setPinInput('');
    } else if (val === 'BACK') {
      setPinInput(prev => prev.slice(0, -1));
    } else {
      if (pinInput.length < 12) {
        setPinInput(prev => prev + val);
      }
    }
  };

  const handleSaveNewPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPinInput.length < 4) {
      showToast('PIN minimal 4 karakter', true);
      return;
    }
    onChangePin(newPinInput);
    setIsChangingPin(false);
    setNewPinInput('');
    showToast('PIN Administrator berhasil diperbarui');
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsGoogleLoading(true);
      const res = await googleSignIn();
      if (!res) return;

      const userEmail = res.user.email?.toLowerCase().trim() || '';
      const allowedList = adminGoogleEmails.map(e => e.toLowerCase().trim());

      const isRegistered = allowedList.includes(userEmail);

      const adminUser: AdminGoogleUser = {
        email: userEmail,
        displayName: res.user.displayName || userEmail.split('@')[0],
        photoURL: res.user.photoURL || undefined,
        registeredAt: new Date().toISOString(),
        role: userEmail === 'luasdzatzali@gmail.com' ? 'SUPER_ADMIN' : 'ADMIN'
      };

      if (isRegistered || userEmail === 'luasdzatzali@gmail.com') {
        onLogin(adminUser);
        showToast(`Selamat datang Administrator: ${adminUser.displayName || userEmail}`);
        onClose();
      } else {
        // Let user know they are not on the authorized admin list
        showToast(
          `Akun Google (${userEmail}) belum terdaftar sebagai administrator. Hubungi Super Admin (luasdzatzali@gmail.com) atau masukkan PIN.`,
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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl relative space-y-4 max-h-[92vh] overflow-y-auto no-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">
                {isAdmin ? 'Portal Administrator Aktif' : 'Autentikasi Administrator'}
              </h3>
              <p className="text-[10px] text-slate-400">
                Pendaftaran & login akun Google & PIN darurat
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isAdmin ? (
          /* Logged-In Admin Panel */
          <div className="space-y-4 text-xs">
            {/* Active Admin Banner */}
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 flex items-start space-x-2.5">
              <Unlock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-semibold block text-white text-xs">
                  Hak Akses Administrator Penuh Aktif
                </span>
                <span className="text-[11px] text-emerald-300/90 block">
                  {currentAdminUser ? (
                    <>
                      Login via Google:{' '}
                      <strong className="text-white font-mono">{currentAdminUser.email}</strong>
                    </>
                  ) : (
                    'Login via PIN Kredensial Sistem Workshop'
                  )}
                </span>
              </div>
            </div>

            {/* Google Admin User Profile if logged in */}
            {currentAdminUser && (
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 flex items-center space-x-3">
                {currentAdminUser.photoURL ? (
                  <img
                    src={currentAdminUser.photoURL}
                    alt={currentAdminUser.displayName}
                    className="w-10 h-10 rounded-full border border-cyan-400/40 object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold">
                    {currentAdminUser.email[0].toUpperCase()}
                  </div>
                )}
                <div className="truncate flex-1">
                  <div className="font-semibold text-white text-xs truncate">
                    {currentAdminUser.displayName || currentAdminUser.email}
                  </div>
                  <div className="text-[11px] font-mono text-cyan-300 truncate">
                    {currentAdminUser.email}
                  </div>
                  <span className="inline-block mt-0.5 text-[9px] px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded font-semibold">
                    {currentAdminUser.role || 'ADMINISTRATOR'}
                  </span>
                </div>
              </div>
            )}

            {/* Management Section: Pendaftaran Administrator Google */}
            <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-white text-xs flex items-center space-x-1.5">
                  <Mail className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Daftar Email Administrator Google</span>
                </h4>
                <span className="text-[10px] text-slate-400 font-mono">
                  {adminGoogleEmails.length} terdaftar
                </span>
              </div>

              {/* Form tambah email admin */}
              <form onSubmit={handleAddEmail} className="flex space-x-1.5">
                <input
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="admin-baru@gmail.com"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
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
                {adminGoogleEmails.map((email) => {
                  const isSuper = email.toLowerCase() === 'luasdzatzali@gmail.com';
                  return (
                    <div
                      key={email}
                      className="flex items-center justify-between bg-slate-900/60 border border-slate-800 px-2.5 py-1.5 rounded-lg text-xs"
                    >
                      <div className="truncate mr-2 flex items-center space-x-1.5">
                        <span className="font-mono text-slate-200 truncate">{email}</span>
                        {isSuper && (
                          <span className="text-[9px] px-1 py-0.2 bg-amber-500/20 text-amber-300 rounded font-semibold shrink-0">
                            Super Admin
                          </span>
                        )}
                      </div>
                      {!isSuper && (
                        <button
                          type="button"
                          onClick={() => onRemoveAdminEmail(email)}
                          className="text-rose-400 hover:text-rose-300 p-1 rounded"
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
              <form onSubmit={handleSaveNewPin} className="space-y-2 bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                <label className="block text-[11px] font-medium text-slate-300">
                  Masukkan PIN Baru
                </label>
                <input
                  type="password"
                  value={newPinInput}
                  onChange={(e) => setNewPinInput(e.target.value)}
                  placeholder="PIN baru (min. 4 digit)"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                />
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsChangingPin(false)}
                    className="w-1/2 py-1.5 bg-slate-800 text-slate-300 rounded-xl text-xs"
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
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium flex items-center justify-center space-x-1.5 border border-slate-700"
              >
                <KeyRound className="w-3.5 h-3.5 text-slate-400" />
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
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-3 text-center space-y-2">
                  <p className="text-xs text-slate-300">
                    Masuk menggunakan akun email Google Anda yang telah didaftarkan sebagai Administrator.
                  </p>
                  <p className="text-[11px] text-cyan-300/90 font-mono">
                    Super Admin default: luasdzatzali@gmail.com
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

                <div className="text-[10px] text-slate-500 text-center">
                  Otentikasi aman berbasis Google Workspace OAuth & Firebase Auth.
                </div>
              </div>
            )}

            {activeTab === 'PIN' && (
              <form onSubmit={handlePinSubmit} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-300">
                      PIN Workshop Administrator
                    </label>
                    <span className="text-[10px] text-slate-400">Default: 12345678</span>
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
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-center text-lg font-mono tracking-widest text-white focus:outline-none focus:border-cyan-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white"
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
                      className="py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-sm font-semibold font-mono active:scale-95 transition border border-slate-700/50"
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
