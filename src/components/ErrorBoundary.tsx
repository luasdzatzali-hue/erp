import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Terjadi kesalahan tidak terduga pada aplikasi.'
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ProdTrack ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let friendlyMsg = this.state.errorMessage;
      try {
        const parsed = JSON.parse(this.state.errorMessage);
        if (parsed && parsed.error) {
          friendlyMsg = `Operasi Database Cloud (${parsed.operationType || 'akses'}) ditolak atau gagal: ${parsed.error}`;
        }
      } catch {
        // Not JSON
      }

      return (
        <div className="min-h-screen bg-canvas text-ink-primary flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-surface border border-rose-500/40 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-ink-rose">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-ink-primary">Gangguan Sistem / Akses Cloud</h2>
                <p className="text-xs text-ink-secondary">ProdTrack MES Security &amp; Integrity Guard</p>
              </div>
            </div>

            <div className="bg-canvas border border-border-subtle rounded-xl p-3 text-xs text-ink-rose font-mono break-words max-h-40 overflow-y-auto">
              {friendlyMsg}
            </div>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Muat Ulang Aplikasi</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
