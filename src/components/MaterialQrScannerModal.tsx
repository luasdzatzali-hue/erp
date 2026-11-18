import React, { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  X,
  SwitchCamera,
  Flashlight,
  Upload,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Keyboard,
  Pause,
  Play,
  Tag
} from 'lucide-react';
import { Material } from '../types';
import { parseMaterialQrScan, ParsedMaterialQrResult } from '../utils/materialQr';

interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap) => Promise<Array<{ rawValue?: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

export interface MaterialQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  materials: Material[];
  title?: string;
  subtitle?: string;
  /** If true, keeps scanner open after a match so operator can scan multiple materials consecutively */
  allowContinuous?: boolean;
  /** Optional status feedback banner rendered inside modal for continuous scanning */
  lastFeedback?: {
    type: 'success' | 'warning' | 'error';
    title: string;
    detail?: string;
  } | null;
  onScanMatched: (result: ParsedMaterialQrResult) => void;
  onOpenLabelGenerator?: () => void;
}

export const MaterialQrScannerModal: React.FC<MaterialQrScannerModalProps> = ({
  isOpen,
  onClose,
  materials,
  title = 'Scan QR Code Material',
  subtitle = 'Arahkan kamera ke label QR pada kemasan bahan baku (zak, drum, IBC, atau kartu lot).',
  allowContinuous = false,
  lastFeedback = null,
  onScanMatched,
  onOpenLabelGenerator,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const lastDecodedRef = useRef<{ value: string; time: number }>({ value: '', time: 0 });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [inputMode, setInputMode] = useState<'camera' | 'manual'>('camera');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'active' | 'error'>('idle');
  const [cameraError, setCameraError] = useState<string>('');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [continuousMode, setContinuousMode] = useState<boolean>(allowContinuous);

  const [manualText, setManualText] = useState<string>('');
  const [unmatchedScan, setUnmatchedScan] = useState<string | null>(null);
  const [recentScanText, setRecentScanText] = useState<string | null>(null);

  useEffect(() => {
    setContinuousMode(allowContinuous);
  }, [allowContinuous]);

  // Initialize native BarcodeDetector if available for faster decoding
  useEffect(() => {
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window && window.BarcodeDetector) {
      try {
        detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch {
        detectorRef.current = null;
      }
    }
  }, []);

  const stopCameraStream = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore track cleanup error
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const handleDecodedPayload = useCallback(
    (rawValue: string) => {
      const cleaned = rawValue.trim();
      if (!cleaned) return;

      const now = Date.now();
      // Debounce identical scans within 1800ms so continuous scanning does not spam
      if (
        lastDecodedRef.current.value === cleaned &&
        now - lastDecodedRef.current.time < 1800
      ) {
        return;
      }
      lastDecodedRef.current = { value: cleaned, time: now };
      setRecentScanText(cleaned);

      const parsed = parseMaterialQrScan(cleaned, materials);
      if (!parsed.matchedMaterial) {
        setUnmatchedScan(cleaned);
        return;
      }

      setUnmatchedScan(null);
      onScanMatched(parsed);

      if (!continuousMode) {
        stopCameraStream();
        onClose();
      }
    },
    [materials, onScanMatched, continuousMode, stopCameraStream, onClose]
  );

  const startCamera = useCallback(async () => {
    if (!isOpen || inputMode !== 'camera') return;

    stopCameraStream();
    setCameraState('starting');
    setCameraError('');
    setUnmatchedScan(null);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setCameraState('error');
      setCameraError(
        'Browser atau pratinjau tidak mendukung akses kamera WebRTC. Gunakan unggah gambar QR atau input kode manual.'
      );
      return;
    }

    try {
      const videoConstraint: MediaTrackConstraints = selectedDeviceId
        ? {
            deviceId: { exact: selectedDeviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraint,
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Inspect track capabilities for torch and update camera device list
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
        const caps = videoTrack.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
        setTorchSupported(Boolean(caps.torch));
      }

      if (navigator.mediaDevices.enumerateDevices) {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = allDevices.filter((d) => d.kind === 'videoinput');
        setDevices(videoInputs);
      }

      setCameraState('active');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      let friendly = 'Gagal membuka kamera. Pastikan izin kamera diizinkan pada browser.';
      if (/NotAllowedError|Permission denied|PermissionDismissed/i.test(message)) {
        friendly =
          'Izin akses kamera ditolak. Aktifkan izin kamera pada pengaturan browser atau gunakan Unggah Gambar QR / Input Manual.';
      } else if (/NotFoundError|Requested device not found|DevicesNotFound/i.test(message)) {
        friendly =
          'Perangkat kamera tidak ditemukan pada perangkat ini. Gunakan Unggah Gambar QR atau Input Manual.';
      } else if (/NotReadableError|TrackStartError/i.test(message)) {
        friendly =
          'Kamera sedang digunakan oleh aplikasi lain. Tutup aplikasi lain lalu klik Coba Lagi.';
      }
      setCameraState('error');
      setCameraError(friendly);
    }
  }, [isOpen, inputMode, selectedDeviceId, facingMode, stopCameraStream]);

  // Start / cleanup camera on modal open & close
  useEffect(() => {
    if (isOpen && inputMode === 'camera') {
      startCamera();
    } else {
      stopCameraStream();
      if (!isOpen) {
        setCameraState('idle');
        setUnmatchedScan(null);
        setRecentScanText(null);
        setManualText('');
        setIsPaused(false);
        lastDecodedRef.current = { value: '', time: 0 };
      }
    }

    return () => {
      stopCameraStream();
    };
  }, [isOpen, inputMode, startCamera, stopCameraStream]);

  // Animation loop to scan video frames for QR codes
  useEffect(() => {
    if (!isOpen || inputMode !== 'camera' || cameraState !== 'active' || isPaused) {
      return;
    }

    let cancelled = false;
    let lastTick = 0;
    let isDetecting = false;

    const scanFrame = async (timestamp: number) => {
      if (cancelled) return;

      // Scan at ~10 fps to keep UI responsive
      if (timestamp - lastTick >= 95 && !isDetecting) {
        lastTick = timestamp;
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (video && canvas && video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
          isDetecting = true;
          try {
            if (detectorRef.current) {
              const detected = await detectorRef.current.detect(video);
              if (detected.length > 0 && detected[0].rawValue) {
                handleDecodedPayload(detected[0].rawValue);
              }
            } else {
              const targetW = Math.min(video.videoWidth, 720);
              const scale = targetW / video.videoWidth;
              const targetH = Math.round(video.videoHeight * scale);
              canvas.width = targetW;
              canvas.height = targetH;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(video, 0, 0, targetW, targetH);
                const imageData = ctx.getImageData(0, 0, targetW, targetH);
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                  inversionAttempts: 'dontInvert',
                });
                if (code?.data) {
                  handleDecodedPayload(code.data);
                }
              }
            }
          } catch {
            // Fallback to jsQR if native BarcodeDetector fails on frame
            try {
              const targetW = Math.min(video.videoWidth, 640);
              const scale = targetW / video.videoWidth;
              const targetH = Math.round(video.videoHeight * scale);
              canvas.width = targetW;
              canvas.height = targetH;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(video, 0, 0, targetW, targetH);
                const imageData = ctx.getImageData(0, 0, targetW, targetH);
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                  inversionAttempts: 'attemptBoth',
                });
                if (code?.data) {
                  handleDecodedPayload(code.data);
                }
              }
            } catch {
              // ignore frame decode error
            }
          } finally {
            isDetecting = false;
          }
        }
      }

      if (!cancelled) {
        rafRef.current = requestAnimationFrame(scanFrame);
      }
    };

    rafRef.current = requestAnimationFrame(scanFrame);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isOpen, inputMode, cameraState, isPaused, handleDecodedPayload]);

  const handleToggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  const handleSwitchCamera = () => {
    if (devices.length > 1) {
      const idx = devices.findIndex((d) => d.deviceId === selectedDeviceId);
      const nextIdx = idx === -1 ? 1 : (idx + 1) % devices.length;
      setSelectedDeviceId(devices[nextIdx].deviceId);
    } else {
      setSelectedDeviceId('');
      setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 1024;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });

        if (decoded?.data) {
          handleDecodedPayload(decoded.data);
        } else {
          setUnmatchedScan(`Gambar "${file.name}" tidak mengandung QR Code yang terbaca.`);
        }
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim()) return;
    handleDecodedPayload(manualText);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-scanner-modal-title"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-800">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 id="qr-scanner-modal-title" className="text-sm sm:text-base font-bold text-white">
                {title}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{subtitle}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              stopCameraStream();
              onClose();
            }}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0"
            aria-label="Tutup pemindai QR"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs & Secondary Actions */}
        <div className="px-5 pt-3.5 pb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 bg-slate-950/50">
          <div className="flex items-center gap-1 p-1 bg-slate-800 rounded-xl border border-slate-700">
            <button
              type="button"
              onClick={() => setInputMode('camera')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                inputMode === 'camera'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Kamera Live</span>
            </button>

            <button
              type="button"
              onClick={() => setInputMode('manual')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                inputMode === 'manual'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span>Input Kode / Gambar</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {allowContinuous && (
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none px-2.5 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700">
                <input
                  type="checkbox"
                  checked={continuousMode}
                  onChange={(e) => setContinuousMode(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-cyan-500 bg-slate-900 border-slate-600"
                />
                <span className="whitespace-nowrap">Scan Beruntun</span>
              </label>
            )}

            {onOpenLabelGenerator && (
              <button
                type="button"
                onClick={onOpenLabelGenerator}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
              >
                <Tag className="w-3.5 h-3.5 text-cyan-400" />
                <span>Buat Label QR</span>
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Continuous scan feedback banner */}
          {lastFeedback && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                lastFeedback.type === 'success'
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                  : lastFeedback.type === 'warning'
                  ? 'bg-amber-950/50 border-amber-500/40 text-amber-200'
                  : 'bg-rose-950/50 border-rose-500/40 text-rose-200'
              }`}
            >
              {lastFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <p className="font-bold">{lastFeedback.title}</p>
                {lastFeedback.detail && (
                  <p className="text-[11px] opacity-90 mt-0.5">{lastFeedback.detail}</p>
                )}
              </div>
            </div>
          )}

          {/* Unmatched warning */}
          {unmatchedScan && (
            <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-950/40 text-xs text-amber-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">QR Code Tidak Dikenali di Database Material</p>
                <p className="text-[11px] font-mono text-amber-300/90 break-all mt-0.5">
                  Isi QR: {unmatchedScan}
                </p>
              </div>
            </div>
          )}

          {inputMode === 'camera' ? (
            <div className="space-y-3">
              {/* Camera Viewport */}
              <div className="relative w-full aspect-video max-h-[340px] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className={`w-full h-full object-cover ${cameraState === 'active' ? 'block' : 'hidden'}`}
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Reticle overlay when camera is active */}
                {cameraState === 'active' && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="w-48 h-48 sm:w-56 sm:h-56 relative">
                      <span className="absolute top-0 left-0 w-7 h-7 border-t-3 border-l-3 border-cyan-400 rounded-tl-lg" />
                      <span className="absolute top-0 right-0 w-7 h-7 border-t-3 border-r-3 border-cyan-400 rounded-tr-lg" />
                      <span className="absolute bottom-0 left-0 w-7 h-7 border-b-3 border-l-3 border-cyan-400 rounded-bl-lg" />
                      <span className="absolute bottom-0 right-0 w-7 h-7 border-b-3 border-r-3 border-cyan-400 rounded-br-lg" />
                    </div>
                  </div>
                )}

                {cameraState === 'starting' && (
                  <div className="text-center p-6 space-y-2">
                    <RefreshCw className="w-7 h-7 text-cyan-400 animate-spin mx-auto" />
                    <p className="text-xs font-medium text-slate-300">
                      Menginisialisasi kamera perangkat...
                    </p>
                  </div>
                )}

                {cameraState === 'error' && (
                  <div className="text-center p-6 max-w-md space-y-3">
                    <div className="w-11 h-11 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
                      <Camera className="w-5 h-5" />
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{cameraError}</p>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={startCamera}
                        className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Coba Lagi</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
                      >
                        <Upload className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Unggah Gambar QR</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Camera Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSwitchCamera}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
                  >
                    <SwitchCamera className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Ganti Kamera ({facingMode === 'environment' ? 'Belakang' : 'Depan'})</span>
                  </button>

                  {cameraState === 'active' && (
                    <button
                      type="button"
                      onClick={() => setIsPaused((p) => !p)}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
                    >
                      {isPaused ? (
                        <>
                          <Play className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Lanjutkan</span>
                        </>
                      ) : (
                        <>
                          <Pause className="w-3.5 h-3.5 text-amber-400" />
                          <span>Jeda</span>
                        </>
                      )}
                    </button>
                  )}

                  {torchSupported && cameraState === 'active' && (
                    <button
                      type="button"
                      onClick={handleToggleTorch}
                      className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition ${
                        torchOn
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                          : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                      }`}
                    >
                      <Flashlight className="w-3.5 h-3.5" />
                      <span>{torchOn ? 'Lampu Mati' : 'Senter'}</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
                >
                  <Upload className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Scan dari File Gambar</span>
                </button>
              </div>

              {devices.length > 1 && (
                <div className="flex items-center gap-2 text-xs">
                  <label className="text-slate-400 whitespace-nowrap">Perangkat Kamera:</label>
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-white text-xs focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Otomatis ({facingMode === 'environment' ? 'Kamera Belakang' : 'Kamera Depan'})</option>
                    {devices.map((dev, idx) => (
                      <option key={dev.deviceId || idx} value={dev.deviceId}>
                        {dev.label || `Kamera ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Upload QR Image */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-white">Unggah Foto / Gambar Label QR</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Pilih file PNG/JPG/WebP berisi QR Code label material untuk didekode langsung di browser.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition"
                >
                  <Upload className="w-4 h-4" />
                  <span>Pilih Gambar QR</span>
                </button>
              </div>

              {/* Manual Barcode / QR String Input */}
              <form onSubmit={handleManualSubmit} className="space-y-2.5">
                <label className="block text-xs font-semibold text-slate-200">
                  Input Manual Kode Material atau String QR (JSON / Scanner USB)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    placeholder='Contoh: MAT-TP-01 atau {"code":"MAT-TP-01","lot":"LOT-26A","qty":250}'
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold whitespace-nowrap shrink-0 transition"
                  >
                    Identifikasi
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Mendukung barcode/QR scanner hardware (mode keyboard), kode material, maupun format JSON terstruktur.
                </p>
              </form>

              {/* Quick Lookup Samples from Master Database */}
              {materials.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-slate-400 block">
                    Pilih Cepat Material Terdaftar ({materials.length} tersedia):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-1">
                    {materials.slice(0, 12).map((mat) => (
                      <button
                        key={mat.id}
                        type="button"
                        onClick={() => handleDecodedPayload(mat.code || mat.id)}
                        className="text-left px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 transition flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{mat.name}</p>
                          <p className="text-[11px] text-slate-400 font-mono truncate">
                            {mat.code || mat.id} · {mat.type} · {mat.packaging}
                          </p>
                        </div>
                        <QrCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Last scanned raw string footer note */}
          {recentScanText && (
            <div className="text-[11px] text-slate-400 flex items-center gap-2 pt-1 border-t border-slate-800/80">
              <span>Terakhir terbaca:</span>
              <code className="font-mono text-cyan-300 truncate max-w-md">{recentScanText}</code>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
};
