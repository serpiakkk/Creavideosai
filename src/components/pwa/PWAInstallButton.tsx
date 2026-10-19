import React, { useState } from 'react';
import { Download, Share2, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already installed, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98] transition-all"
        title="Instalar AutoVideo IA en tu pantalla de inicio"
      >
        <Download className="w-4 h-4" />
        <span>Instalar App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-950/40 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-900/40 active:scale-[0.98] transition"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Instalar en iPhone</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100 relative">
              <button
                onClick={() => setShowIOSGuide(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Download className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Instalar en iPhone o iPad</h3>
                  <p className="text-xs text-slate-400">Úsala como una app nativa sin barra</p>
                </div>
              </div>

              <div className="space-y-3 text-sm text-slate-300 my-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </div>
                  <p className="text-xs leading-relaxed">
                    Toca el botón <strong className="text-white flex items-center gap-1 inline-flex"><Share2 className="w-3.5 h-3.5 inline" /> Compartir</strong> en la barra inferior de Safari.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </div>
                  <p className="text-xs leading-relaxed">
                    Desplázate hacia abajo y selecciona <strong className="text-white flex items-center gap-1 inline-flex"><PlusSquare className="w-3.5 h-3.5 inline" /> Añadir a pantalla de inicio</strong>.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 transition"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
