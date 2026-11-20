import React, { useState } from 'react';
import {
  Users,
  Shield,
  Building,
  UserCheck,
  Plus,
  Trash2,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  X,
  Lock,
  Eye,
  EyeOff,
  Search
} from 'lucide-react';
import {
  AppState,
  RegisteredOperator,
  RegisteredManagement
} from '../types';
import { normalizeEmail, validatePasswordStrength } from '../utils/security';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  onAddOperator: (op: Omit<RegisteredOperator, 'id' | 'registeredAt'>) => void;
  onUpdateOperator: (id: string, updates: Partial<RegisteredOperator>) => void;
  onDeleteOperator: (id: string) => void;
  onAddManagement: (mgt: Omit<RegisteredManagement, 'id' | 'registeredAt'>) => void;
  onToggleManagementAccess: (id: string, hasAccess: boolean) => void;
  onDeleteManagement: (id: string) => void;
  onChangeAdminPin: (newPin: string) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  isOpen,
  onClose,
  state,
  onAddOperator,
  onUpdateOperator,
  onDeleteOperator,
  onAddManagement,
  onToggleManagementAccess,
  onDeleteManagement,
  onChangeAdminPin,
  showToast
}) => {
  const [activeTab, setActiveTab] = useState<'OPERATORS' | 'MANAGEMENT' | 'SECURITY'>('OPERATORS');

  // Form states for Operator
  const [opName, setOpName] = useState('');
  const [opNik, setOpNik] = useState('');
  const [opEmail, setOpEmail] = useState('');
  const [opLine, setOpLine] = useState('Line 1 (Biskuit Domestik)');
  const [opShift, setOpShift] = useState<1 | 2 | 3>(1);
  const [opNotes, setOpNotes] = useState('');
  const [opSearch, setOpSearch] = useState('');

  // Form states for Management
  const [mgtName, setMgtName] = useState('');
  const [mgtEmail, setMgtEmail] = useState('');
  const [mgtTitle, setMgtTitle] = useState('');
  const [mgtDepartment, setMgtDepartment] = useState('Plant Operations Management');
  const [mgtAccess, setMgtAccess] = useState(true);
  const [mgtSearch, setMgtSearch] = useState('');

  // Form states for Admin PIN
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // In-app delete confirmation state
  const [modalDeleteConfirm, setModalDeleteConfirm] = useState<{
    type: 'OPERATOR' | 'MANAGEMENT';
    id: string;
    name: string;
    details: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleAutoNik = () => {
    const year = new Date().getFullYear();
    const count = (state.registeredOperators?.length || 0) + 1;
    const generated = `OPR-${year}-${String(count).padStart(3, '0')}`;
    setOpNik(generated);
    showToast(`NIK Otomatis: ${generated}`);
  };

  const handleExecuteModalDelete = () => {
    if (!modalDeleteConfirm) return;
    if (modalDeleteConfirm.type === 'OPERATOR') {
      onDeleteOperator(modalDeleteConfirm.id);
    } else {
      onDeleteManagement(modalDeleteConfirm.id);
    }
    setModalDeleteConfirm(null);
  };

  // Handle Add Operator
  const handleAddOperatorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!opName || !opNik) {
      showToast('Harap lengkapi nama dan NIK operator', true);
      return;
    }
    onAddOperator({
      name: opName,
      nik: opNik,
      email: opEmail.trim() ? opEmail.trim().toLowerCase() : undefined,
      assignedLine: opLine,
      assignedShift: opShift,
      status: 'ACTIVE',
      notes: opNotes
    });
    setOpName('');
    setOpNik('');
    setOpEmail('');
    setOpNotes('');
    showToast(`Operator ${opName} (${opNik}) berhasil didaftarkan`);
  };

  // Handle Add Management
  const handleAddManagementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mgtName || !mgtEmail || !mgtTitle) {
      showToast('Harap lengkapi nama, email, dan jabatan management', true);
      return;
    }
    onAddManagement({
      name: mgtName.trim(),
      email: normalizeEmail(mgtEmail),
      title: mgtTitle.trim(),
      department: mgtDepartment,
      hasViewAccess: mgtAccess
    });
    setMgtName('');
    setMgtEmail('');
    setMgtTitle('');
    showToast(`Akun Management ${mgtName} (${mgtTitle}) berhasil ditambahkan`);
  };

  // Handle Change PIN
  const handleChangePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validatePasswordStrength(newPin);
    if (!check.isValid) {
      showToast(check.message || 'PIN minimal 8 karakter dan tidak boleh umum', true);
      return;
    }
    if (newPin.trim() !== confirmPin.trim()) {
      showToast('Konfirmasi PIN tidak cocok', true);
      return;
    }
    await onChangeAdminPin(newPin.trim());
    setNewPin('');
    setConfirmPin('');
    showToast('PIN Administrator berhasil diperbarui');
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white border border-slate-300 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-900">
        {/* Modal Header */}
        <div className="bg-slate-100 px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-800 border border-amber-300">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-extrabold text-base sm:text-lg text-slate-900">
                Manajemen Pengguna & Otoritas Akses
              </h2>
              <p className="text-xs text-slate-600 font-medium">
                Otoritas Administrator: Pendaftaran Operator & Pengaturan Izin Melihat Management
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-300 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b-2 border-black bg-white px-5 pt-2 gap-2 text-xs">
          <button
            onClick={() => setActiveTab('OPERATORS')}
            className={`pb-2.5 px-3 font-extrabold border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'OPERATORS'
                ? 'border-black text-black'
                : 'border-transparent text-black hover:bg-zinc-100'
            }`}
          >
            <UserCheck className="w-4 h-4 text-black" />
            <span>1. Pendaftaran Operator ({state.registeredOperators.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('MANAGEMENT')}
            className={`pb-2.5 px-3 font-extrabold border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'MANAGEMENT'
                ? 'border-black text-black'
                : 'border-transparent text-black hover:bg-zinc-100'
            }`}
          >
            <Building className="w-4 h-4 text-black" />
            <span>2. Izin Akses Management ({state.registeredManagement.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('SECURITY')}
            className={`pb-2.5 px-3 font-extrabold border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'SECURITY'
                ? 'border-black text-black'
                : 'border-transparent text-black hover:bg-zinc-100'
            }`}
          >
            <Lock className="w-4 h-4 text-black" />
            <span>3. Keamanan & PIN Admin</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* TAB 1: OPERATORS */}
          {activeTab === 'OPERATORS' && (
            <div className="space-y-4">
              {/* Add Operator Form */}
              <form onSubmit={handleAddOperatorSubmit} className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h3 className="font-bold text-xs sm:text-sm text-white flex items-center space-x-1.5">
                    <Plus className="w-4 h-4 text-cyan-400" />
                    <span>Daftarkan Operator Baru</span>
                  </h3>
                  <span className="text-[10px] text-slate-500 font-mono">Lantai Produksi & Gudang</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Nama Lengkap Operator:</label>
                    <input
                      type="text"
                      required
                      value={opName}
                      onChange={(e) => setOpName(e.target.value)}
                      placeholder="e.g. Supriyadi Pratama"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-slate-400 font-medium">Nomor Induk Karyawan (NIK):</label>
                      <button
                        type="button"
                        onClick={handleAutoNik}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 font-mono underline"
                      >
                        Auto NIK
                      </button>
                    </div>
                    <input
                      type="text"
                      required
                      value={opNik}
                      onChange={(e) => setOpNik(e.target.value)}
                      placeholder="e.g. OPR-2026-005"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Line Penugasan:</label>
                    <select
                      value={opLine}
                      onChange={(e) => setOpLine(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                    >
                      <option value="Line 1 (Biskuit Domestik)">Line 1 (Biskuit Domestik)</option>
                      <option value="Line 2 (Wafer Ekspor KITE)">Line 2 (Wafer Ekspor KITE)</option>
                      <option value="Line 3 (Crackers & Cookie)">Line 3 (Crackers & Cookie)</option>
                      <option value="Gudang Bahan Baku (CK & WINEROTO)">Gudang Bahan Baku (CK & WINEROTO)</option>
                      <option value="Gudang Tangki Liquid (Storage Tank)">Gudang Tangki Liquid (Storage Tank)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Shift Rutin:</label>
                    <select
                      value={opShift}
                      onChange={(e) => setOpShift(Number(e.target.value) as 1 | 2 | 3)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                    >
                      <option value={1}>Shift 1 (07:01 - 15:00)</option>
                      <option value={2}>Shift 2 (15:01 - 23:00)</option>
                      <option value={3}>Shift 3 (23:01 - 07:00)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Email Google Operator (Opsional - Akses Cloud):</label>
                    <input
                      type="email"
                      value={opEmail}
                      onChange={(e) => setOpEmail(e.target.value)}
                      placeholder="e.g. ahmad.fauzi@gmail.com"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Catatan / Sertifikasi Mesin (Opsional):</label>
                    <input
                      type="text"
                      value={opNotes}
                      onChange={(e) => setOpNotes(e.target.value)}
                      placeholder="e.g. Sertifikasi Food Safety & Operator Mixer High-Shear"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs shadow-md shadow-cyan-600/20 active:scale-95 transition"
                >
                  Simpan & Daftarkan Operator
                </button>
              </form>

              {/* Operators List with Search */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Daftar Operator Terdaftar ({state.registeredOperators.length}):
                  </h4>
                  <div className="relative w-44 sm:w-52">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={opSearch}
                      onChange={(e) => setOpSearch(e.target.value)}
                      placeholder="Cari operator..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-7 pr-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto no-scrollbar">
                  {state.registeredOperators
                    .filter(op => {
                      const q = opSearch.toLowerCase();
                      return op.name.toLowerCase().includes(q) || op.nik.toLowerCase().includes(q) || op.assignedLine.toLowerCase().includes(q);
                    })
                    .map(op => (
                      <div
                        key={op.id}
                        className="bg-slate-950/40 border border-slate-800 p-3 rounded-2xl flex items-center justify-between text-xs hover:border-slate-700 transition"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-white text-sm">{op.name}</span>
                            <span className="font-mono text-cyan-400 text-[11px] font-semibold">{op.nik}</span>
                            <span className={`px-2 py-0.2 rounded-full text-[9px] font-bold ${
                              op.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
                            }`}>
                              {op.status === 'ACTIVE' ? 'AKTIF' : 'NON-AKTIF'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            {op.assignedLine} • <strong>Shift {op.assignedShift}</strong> {op.email ? `• ✉️ ${op.email}` : ''} {op.notes ? `• ${op.notes}` : ''}
                          </p>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => onUpdateOperator(op.id, {
                              status: op.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
                            })}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-[10px] font-medium"
                          >
                            {op.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setModalDeleteConfirm({
                                type: 'OPERATOR',
                                id: op.id,
                                name: op.name,
                                details: `NIK: ${op.nik} • ${op.assignedLine} (Shift ${op.assignedShift})`
                              });
                            }}
                            className="p-1.5 rounded-lg bg-white hover:bg-black text-black hover:text-white border-2 border-black transition shadow-xs flex items-center justify-center shrink-0 group"
                            title="Hapus Operator"
                          >
                            <Trash2 className="w-4 h-4 text-black group-hover:text-white" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MANAGEMENT ACCESS */}
          {activeTab === 'MANAGEMENT' && (
            <div className="space-y-4">
              {/* Info Box */}
              <div className="bg-indigo-950/40 border border-indigo-500/40 p-3.5 rounded-2xl text-xs space-y-1">
                <h4 className="font-bold text-indigo-300 flex items-center space-x-1.5">
                  <Building className="w-4 h-4" />
                  <span>Otorisasi Hak Melihat Management (Read-Only)</span>
                </h4>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  Administrator dapat mendaftarkan akun jajaran management (Direktur, Factory Manager, QC, PPIC) dan mengontrol sakelar <strong>"Izin Melihat"</strong>. Pengguna management hanya dapat memantau Dashboard Produksi berjalan, stok material, dan membaca laporan PDF shift tanpa hak mengubah data.
                </p>
              </div>

              {/* Add Management Form */}
              <form onSubmit={handleAddManagementSubmit} className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h3 className="font-bold text-xs sm:text-sm text-white flex items-center space-x-1.5">
                    <Plus className="w-4 h-4 text-indigo-400" />
                    <span>Tambah Akun Management</span>
                  </h3>
                  <span className="text-[10px] text-slate-500 font-mono">Akses Eksekutif</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Nama Lengkap & Gelar:</label>
                    <input
                      type="text"
                      required
                      value={mgtName}
                      onChange={(e) => setMgtName(e.target.value)}
                      placeholder="e.g. Dr. Ir. Gunawan, M.M."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-400"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Alamat Email:</label>
                    <input
                      type="email"
                      required
                      value={mgtEmail}
                      onChange={(e) => setMgtEmail(e.target.value)}
                      placeholder="e.g. gunawan@factory.co.id"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-400"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Jabatan / Title:</label>
                    <input
                      type="text"
                      required
                      value={mgtTitle}
                      onChange={(e) => setMgtTitle(e.target.value)}
                      placeholder="e.g. General Manager / Production Director"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-400"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Departemen / Divisi:</label>
                    <select
                      value={mgtDepartment}
                      onChange={(e) => setMgtDepartment(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-400"
                    >
                      <option value="Plant Operations Management">Plant Operations Management</option>
                      <option value="Quality Assurance & QC">Quality Assurance & QC</option>
                      <option value="Supply Chain Management">Supply Chain Management</option>
                      <option value="PPIC & Produksi">PPIC & Produksi</option>
                      <option value="Engineering & Maintenance">Engineering & Maintenance</option>
                      <option value="Direksi & Komisaris">Direksi & Komisaris</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="mgtAccessCheckbox"
                    checked={mgtAccess}
                    onChange={(e) => setMgtAccess(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 bg-slate-800 border-slate-700 focus:ring-0"
                  />
                  <label htmlFor="mgtAccessCheckbox" className="text-xs text-slate-300 font-medium cursor-pointer">
                    Langsung berikan izin akses melihat (Read-Only) pada akun ini
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-600/20 active:scale-95 transition"
                >
                  Simpan Akun Management
                </button>
              </form>

              {/* Management List with Access Toggle Switch */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Daftar Management Terdaftar ({state.registeredManagement.length}):
                  </h4>
                  <div className="relative w-44 sm:w-52">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={mgtSearch}
                      onChange={(e) => setMgtSearch(e.target.value)}
                      placeholder="Cari management..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-7 pr-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto no-scrollbar">
                  {state.registeredManagement
                    .filter(mgt => {
                      const q = mgtSearch.toLowerCase();
                      return mgt.name.toLowerCase().includes(q) || mgt.email.toLowerCase().includes(q) || mgt.title.toLowerCase().includes(q);
                    })
                    .map(mgt => (
                      <div
                        key={mgt.id}
                        className="bg-slate-950/40 border border-slate-800 p-3 rounded-2xl flex items-center justify-between text-xs hover:border-slate-700 transition"
                      >
                        <div className="space-y-0.5 max-w-sm">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-white text-sm">{mgt.name}</span>
                            <span className="text-[11px] text-slate-400 font-mono truncate">{mgt.email}</span>
                          </div>
                          <p className="text-[11px] text-indigo-300 font-medium">
                            {mgt.title} • <span className="text-slate-400">{mgt.department}</span>
                          </p>
                        </div>

                        <div className="flex items-center space-x-3">
                          {/* Access Toggle Switch */}
                          <div className="flex items-center space-x-2">
                            <button
                              type="button"
                              onClick={() => onToggleManagementAccess(mgt.id, !mgt.hasViewAccess)}
                              className={`px-3 py-1.5 rounded-xl font-bold text-[11px] transition flex items-center space-x-1.5 ${
                                mgt.hasViewAccess
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                              }`}
                            >
                              {mgt.hasViewAccess ? (
                                <>
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Izin Aktif</span>
                                </>
                              ) : (
                                <>
                                  <EyeOff className="w-3.5 h-3.5" />
                                  <span>Izin Nonaktif</span>
                                </>
                              )}
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setModalDeleteConfirm({
                                type: 'MANAGEMENT',
                                id: mgt.id,
                                name: mgt.name,
                                details: `${mgt.title} • ${mgt.email}`
                              });
                            }}
                            className="p-1.5 rounded-lg bg-white hover:bg-black text-black hover:text-white border-2 border-black transition shadow-xs flex items-center justify-center shrink-0 group"
                            title="Hapus Akun Management"
                          >
                            <Trash2 className="w-4 h-4 text-black group-hover:text-white" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SECURITY & ADMIN PIN */}
          {activeTab === 'SECURITY' && (
            <div className="space-y-4">
              <form onSubmit={handleChangePinSubmit} className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center space-x-2 border-b border-slate-800 pb-2">
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  <h3 className="font-bold text-xs sm:text-sm text-white">
                    Ganti PIN Administrator
                  </h3>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  PIN ini digunakan untuk mengamankan akses ke modul Konfigurasi Master BOM, Modifikasi Mesin, Tangki Storage, dan Manajemen Pengguna.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">PIN / Password Baru (Min. 8 karakter):</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      maxLength={128}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value)}
                      placeholder="Minimal 8 karakter unik..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400 tracking-widest"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Konfirmasi PIN Baru:</label>
                    <input
                      type="password"
                      required
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value)}
                      placeholder="Ulangi PIN baru..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400 tracking-widest"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs shadow-md shadow-amber-600/20 active:scale-95 transition"
                >
                  Simpan PIN Administrator Baru
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-100 px-5 py-3 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition border border-slate-300 shadow-xs"
          >
            Selesai
          </button>
        </div>
      </div>

      {/* In-app Delete Confirmation Modal */}
      {modalDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[60] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-rose-100 border border-rose-200 shrink-0">
                <Trash2 className="w-5 h-5 text-rose-700" />
              </div>
              <h4 className="font-extrabold text-sm text-slate-900">
                Hapus {modalDeleteConfirm.type === 'OPERATOR' ? 'Operator' : 'Akun Management'}?
              </h4>
            </div>
            <p className="text-xs text-slate-700">
              Yakin ingin menghapus <strong className="text-slate-900 font-bold">{modalDeleteConfirm.name}</strong> ({modalDeleteConfirm.details}) dari sistem?
            </p>
            <div className="flex items-center space-x-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setModalDeleteConfirm(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteModalDelete}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-sm border border-rose-700"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
