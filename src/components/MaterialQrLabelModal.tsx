import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, X, Download, Printer } from 'lucide-react';
import { Material, StorageLocation } from '../types';
import { buildMaterialQrPayload } from '../utils/materialQr';

interface MaterialQrLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  materials: Material[];
  initialMaterialId?: string;
}

export const MaterialQrLabelModal: React.FC<MaterialQrLabelModalProps> = ({
  isOpen,
  onClose,
  materials,
  initialMaterialId,
}) => {
  const [selectedMatId, setSelectedMatId] = useState<string>(initialMaterialId || '');
  const [lotNumber, setLotNumber] = useState<string>('');
  const [qtyKg, setQtyKg] = useState<string>('');
  const [location, setLocation] = useState<StorageLocation | ''>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      if (initialMaterialId) {
        setSelectedMatId(initialMaterialId);
      } else if (!selectedMatId && materials.length > 0) {
        setSelectedMatId(materials[0].id);
      }
    }
  }, [isOpen, initialMaterialId, materials, selectedMatId]);

  const selectedMat = materials.find((m) => m.id === selectedMatId) || null;
  const payloadString = selectedMat
    ? buildMaterialQrPayload(selectedMat, {
        lotNumber: lotNumber.trim() || undefined,
        qtyKg: qtyKg ? parseFloat(qtyKg) : undefined,
        location: location || undefined,
      })
    : '';

  useEffect(() => {
    if (!isOpen || !payloadString) {
      setQrDataUrl('');
      return;
    }
    let active = true;
    QRCode.toDataURL(payloadString, {
      width: 280,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [isOpen, payloadString]);

  const handleDownloadPng = () => {
    if (!qrDataUrl || !selectedMat) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    const slug = (selectedMat.code || selectedMat.name).replace(/[^a-z0-9_-]+/gi, '_');
    link.download = `QR_${slug}${lotNumber ? `_${lotNumber}` : ''}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-label-modal-title"
    >
      <div className="bg-surface border border-border-subtle rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/15 text-brand border border-cyan-500/30">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 id="qr-label-modal-title" className="text-sm sm:text-base font-bold text-ink-primary">
                Generator Label QR Material
              </h3>
              <p className="text-xs text-ink-secondary">
                Unduh gambar QR untuk ditempel pada kemasan bahan baku atau uji pemindaian.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-ink-secondary hover:text-ink-primary hover:bg-elevated transition"
            aria-label="Tutup generator label QR"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-ink-secondary mb-1">
              Pilih Material Database
            </label>
            <select
              value={selectedMatId}
              onChange={(e) => setSelectedMatId(e.target.value)}
              className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary focus:outline-none focus:border-accent-primary"
            >
              {materials.length === 0 ? (
                <option value="">-- Belum ada material di Master Data --</option>
              ) : (
                materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code ? `[${m.code}] ` : ''}{m.name} ({m.packaging})
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                No. Lot (Opsional)
              </label>
              <input
                type="text"
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                placeholder="LOT-2026-01"
                className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary font-mono placeholder:text-ink-muted"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                Berat / Qty kg (Opsional)
              </label>
              <input
                type="number"
                step="0.01"
                value={qtyKg}
                onChange={(e) => setQtyKg(e.target.value)}
                placeholder="25"
                className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary font-mono placeholder:text-ink-muted"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                Lokasi (Opsional)
              </label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value as StorageLocation | '')}
                className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary"
              >
                <option value="">Otomatis</option>
                <option value="CK">Area CK</option>
                <option value="WINEROTO">WINEROTO</option>
                <option value="STORAGE_TANK">Storage Tank</option>
              </select>
            </div>
          </div>

          {selectedMat && qrDataUrl && (
            <div className="bg-white text-slate-900 rounded-xl p-4 flex flex-col sm:flex-row items-center gap-4 border border-slate-200">
              <img
                src={qrDataUrl}
                alt={`QR Code ${selectedMat.name}`}
                className="w-36 h-36 rounded-lg border border-slate-200 shrink-0"
              />
              <div className="min-w-0 space-y-1 text-center sm:text-left">
                <p className="font-mono text-xs font-bold text-cyan-700">
                  {selectedMat.code || selectedMat.id}
                </p>
                <p className="font-bold text-sm text-slate-900">{selectedMat.name}</p>
                <p className="text-[11px] text-slate-600">
                  {selectedMat.type.toUpperCase()} · {selectedMat.packaging} · {selectedMat.weightKg} kg
                </p>
                {(lotNumber || qtyKg || location) && (
                  <p className="text-[11px] font-mono text-slate-700 pt-1">
                    {[
                      lotNumber ? `Lot: ${lotNumber}` : null,
                      qtyKg ? `Qty: ${qtyKg} kg` : null,
                      location ? `Lok: ${location}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border-subtle">
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!qrDataUrl}
              className="px-3.5 py-2 rounded-xl bg-elevated hover:bg-accent text-ink-primary border border-border-strong font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-40 transition"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Halaman</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={!qrDataUrl}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-40 transition"
            >
              <Download className="w-4 h-4" />
              <span>Unduh PNG QR</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
