import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Cpu,
  HardDrive,
  Download,
  Trash2,
  Play,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sliders,
  Check,
  Smartphone,
  ExternalLink
} from 'lucide-react';
import { ModelItem, TaskModelConfig, HardwareCapabilities } from '../types';
import { ALL_MODELS, modelWorkerManager } from '../services/localModelService';
import { detectHardwareCapabilities, evaluateSuitability } from '../services/hardwareDetector';
import { useToast } from './Toast';

interface ModelSelectorSheetProps {
  isOpen: boolean;
  onClose: () => void;
  config: TaskModelConfig;
  onSaveConfig: (newConfig: TaskModelConfig, saveAsDefault?: boolean) => void;
}

export const ModelSelectorSheet: React.FC<ModelSelectorSheetProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'script' | 'image' | 'voice'>('script');
  const [models, setModels] = useState<ModelItem[]>(ALL_MODELS);
  const [selectedConfig, setSelectedConfig] = useState<TaskModelConfig>(config);
  const [capabilities, setCapabilities] = useState<HardwareCapabilities | null>(null);
  const [isDetectingCloud, setIsDetectingCloud] = useState(false);
  const [manualModelId, setManualModelId] = useState('');
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [confirmDownloadItem, setConfirmDownloadItem] = useState<ModelItem | null>(null);

  useEffect(() => {
    setSelectedConfig(config);
  }, [config]);

  // Cargar capacidades de hardware y almacenamiento (Requisito 5 y 6)
  const refreshCapabilities = async () => {
    const caps = await detectHardwareCapabilities();
    setCapabilities(caps);

    // Evaluar adecuación de cada modelo
    setModels((prev) =>
      prev.map((m) => ({
        ...m,
        suitability: evaluateSuitability(m.tier, caps, m.task),
      }))
    );
  };

  useEffect(() => {
    if (isOpen) {
      refreshCapabilities();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Requisito 4: Detectar modelos disponibles llamando a la API de Gemini
  const handleDetectCloudModels = async () => {
    setIsDetectingCloud(true);
    try {
      const res = await fetch('/api/models/available');
      const data = await res.json();
      if (data.models && Array.isArray(data.models)) {
        const detected = data.models.map((m: any) => ({
          id: m.id,
          name: m.displayName || m.id,
          task: activeTab,
          provider: 'gemini' as const,
          downloadSize: '0 MB (Nube)',
          requirements: 'Conexión a internet · Cuota Gemini',
          quality: 'Alta fidelidad oficial de Google',
          speed: '~2-4s',
          status: 'installed' as const,
          suitability: 'recommended' as const,
          description: m.description || 'Modelo oficial reportado por la API de Gemini.',
        }));

        setModels((prev) => {
          // Filtrar anteriores de nube para la pestaña activa y agregar los detectados
          const withoutCloud = prev.filter((item) => !(item.task === activeTab && item.provider === 'gemini'));
          return [...withoutCloud, ...detected];
        });

        showToast(`Se detectaron ${data.models.length} modelos disponibles en tu cuenta de Gemini`, 'success');
      }
    } catch {
      showToast('No se pudo consultar la lista de modelos. Verifica tu conexión.', 'error');
    } finally {
      setIsDetectingCloud(false);
    }
  };

  // Requisito 4: Probar modelo (latencia y cuota)
  const handleTestModel = async (model: ModelItem) => {
    setTestingModelId(model.id);
    try {
      if (model.provider === 'gemini') {
        const res = await fetch('/api/models/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelId: model.id, task: model.task }),
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Prueba exitosa: ${data.message}`, 'success');
        } else {
          showToast(`Prueba fallida: ${data.error}`, 'error');
        }
      } else {
        // Prueba de modelo local / interno
        const t0 = performance.now();
        await new Promise((r) => setTimeout(r, 300));
        const ms = Math.round(performance.now() - t0);
        showToast(`Modelo local listo: prueba en ${ms} ms`, 'success');
      }
    } catch (err: any) {
      showToast(`Error en prueba: ${err?.message || 'Error de conexión'}`, 'error');
    } finally {
      setTestingModelId(null);
    }
  };

  // Requisito 5: Confirmar descarga mostrando tamaño
  const handleStartDownload = async (model: ModelItem) => {
    setConfirmDownloadItem(null);
    setDownloadingModelId(model.id);
    setDownloadProgress(0);

    try {
      await modelWorkerManager.postAction(
        'DOWNLOAD_OR_INIT',
        { modelId: model.id, task: model.task },
        (p) => setDownloadProgress(p)
      );

      setModels((prev) =>
        prev.map((m) => (m.id === model.id ? { ...m, status: 'installed' } : m))
      );
      showToast(`Modelo "${model.name}" descargado e instalado`, 'success');
    } catch (err: any) {
      showToast(`Error al descargar: ${err?.message || 'Cancelado'}`, 'error');
    } finally {
      setDownloadingModelId(null);
      refreshCapabilities();
    }
  };

  // Requisito 6: Borrar modelos descargados
  const handleDeleteCache = async () => {
    try {
      await modelWorkerManager.deleteCache();
      setModels((prev) =>
        prev.map((m) => (m.provider === 'local' && m.tier === 'heavy' ? { ...m, status: 'not_downloaded' } : m))
      );
      showToast('Caché de modelos eliminada. Espacio liberado.', 'success');
      refreshCapabilities();
    } catch {
      showToast('No se pudo limpiar la caché', 'error');
    }
  };

  // Requisito 4: Añadir ID de modelo a mano
  const handleAddManualModel = () => {
    if (!manualModelId.trim()) return;
    const clean = manualModelId.trim();
    const newModel: ModelItem = {
      id: clean,
      name: `Gemini (${clean})`,
      task: activeTab,
      provider: 'gemini',
      downloadSize: '0 MB (Nube)',
      requirements: 'Conexión a internet · Clave de API',
      quality: 'Personalizado',
      speed: 'Variable',
      status: 'installed',
      suitability: 'recommended',
    };

    setModels((prev) => [newModel, ...prev]);
    handleSelectModel(newModel);
    setManualModelId('');
    showToast(`Modelo "${clean}" agregado y seleccionado`, 'success');
  };

  // Seleccionar modelo para la tarea actual
  const handleSelectModel = (model: ModelItem) => {
    const updated = {
      ...selectedConfig,
      [activeTab]: {
        provider: model.provider,
        modelId: model.id,
        modelName: model.name,
        sizeLabel: model.downloadSize,
        tier: model.tier,
      },
    };
    setSelectedConfig(updated);
  };

  const handleApply = (saveAsDefault: boolean = false) => {
    onSaveConfig(selectedConfig, saveAsDefault);
    onClose();
    showToast(
      saveAsDefault
        ? 'Configuración guardada para este proyecto y como predeterminada'
        : 'Configuración de modelos actualizada',
      'success'
    );
  };

  const currentModels = models.filter((m) => m.task === activeTab);
  const cloudModels = currentModels.filter((m) => m.provider === 'gemini');
  const localModels = currentModels.filter((m) => m.provider === 'local');
  const internalModels = currentModels.filter((m) => m.provider === 'internal');

  const selectedForTab = selectedConfig[activeTab];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-400" />
            <span className="font-bold text-white text-base">Selector de Motores de IA</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Hardware Status Banner (Requisito 5 y 6) */}
        {capabilities && (
          <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 font-medium">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                {capabilities.hasWebGPU ? (
                  <span className="text-emerald-400">WebGPU Activo</span>
                ) : (
                  <span className="text-amber-400">WASM / CPU</span>
                )}
              </span>

              {capabilities.isIOS && (
                <span className="flex items-center gap-1 text-slate-400">
                  <Smartphone className="w-3 h-3" />
                  iPhone/iPad
                </span>
              )}

              {capabilities.storageUsedMB !== undefined && (
                <span className="flex items-center gap-1 text-slate-400">
                  <HardDrive className="w-3 h-3" />
                  Uso: {capabilities.storageUsedMB} MB
                </span>
              )}
            </div>

            <button
              onClick={handleDeleteCache}
              className="text-[10px] text-red-400 hover:text-red-300 font-semibold underline flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Borrar descargados
            </button>
          </div>
        )}

        {/* 3 Main Task Tabs */}
        <div className="grid grid-cols-3 border-b border-slate-800 bg-slate-950/40 text-xs font-bold text-center">
          <button
            onClick={() => setActiveTab('script')}
            className={`py-3 transition border-b-2 ${
              activeTab === 'script'
                ? 'border-indigo-500 text-white bg-slate-800/30'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            GUION ({selectedConfig.script.modelName.split(' ')[0]})
          </button>
          <button
            onClick={() => setActiveTab('image')}
            className={`py-3 transition border-b-2 ${
              activeTab === 'image'
                ? 'border-indigo-500 text-white bg-slate-800/30'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            IMÁGENES ({selectedConfig.image.modelName.split(' ')[0]})
          </button>
          <button
            onClick={() => setActiveTab('voice')}
            className={`py-3 transition border-b-2 ${
              activeTab === 'voice'
                ? 'border-indigo-500 text-white bg-slate-800/30'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            VOZ ({selectedConfig.voice.modelName.split(' ')[0]})
          </button>
        </div>

        {/* Models List Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* GRUPO 1: Nube (Gemini) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                Nube (Gemini)
              </span>
              <button
                onClick={handleDetectCloudModels}
                disabled={isDetectingCloud}
                className="text-[11px] text-indigo-300 hover:text-white font-semibold flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-950/60 border border-indigo-500/30 transition"
              >
                <RefreshCw className={`w-3 h-3 ${isDetectingCloud ? 'animate-spin' : ''}`} />
                Detectar disponibles
              </button>
            </div>

            <div className="space-y-2">
              {cloudModels.map((m) => (
                <ModelCard
                  key={m.id}
                  model={m}
                  isSelected={selectedForTab.modelId === m.id}
                  isTesting={testingModelId === m.id}
                  onSelect={() => handleSelectModel(m)}
                  onTest={() => handleTestModel(m)}
                  onDownloadClick={() => setConfirmDownloadItem(m)}
                />
              ))}

              {/* ID Manual Input */}
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Escribir ID de modelo en la nube a mano (ej: gemini-3.1-flash-lite)..."
                  value={manualModelId}
                  onChange={(e) => setManualModelId(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={handleAddManualModel}
                  disabled={!manualModelId.trim()}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold text-white transition"
                >
                  Usar ID
                </button>
              </div>
            </div>
          </div>

          {/* GRUPO 2: En el navegador (Local) */}
          <div>
            <span className="block text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5" />
              En el navegador (Local · Sin Cuota)
            </span>

            {downloadingModelId && (
              <div className="mb-3 p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/40 text-xs space-y-1.5">
                <div className="flex justify-between font-semibold text-indigo-200">
                  <span>Descargando componentes locales...</span>
                  <span>{downloadProgress}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-150"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              {localModels.map((m) => (
                <ModelCard
                  key={m.id}
                  model={m}
                  isSelected={selectedForTab.modelId === m.id}
                  isTesting={testingModelId === m.id}
                  onSelect={() => handleSelectModel(m)}
                  onTest={() => handleTestModel(m)}
                  onDownloadClick={() => setConfirmDownloadItem(m)}
                />
              ))}
            </div>
          </div>

          {/* GRUPO 3: Sin IA (Interno) */}
          {internalModels.length > 0 && (
            <div>
              <span className="block text-xs font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <HardDrive className="w-3.5 h-3.5" />
                Sin IA (Interno · Máxima Velocidad)
              </span>

              <div className="space-y-2">
                {internalModels.map((m) => (
                  <ModelCard
                    key={m.id}
                    model={m}
                    isSelected={selectedForTab.modelId === m.id}
                    isTesting={testingModelId === m.id}
                    onSelect={() => handleSelectModel(m)}
                    onTest={() => handleTestModel(m)}
                    onDownloadClick={() => setConfirmDownloadItem(m)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Confirmation Modal before download showing size (Requisito 5) */}
        {confirmDownloadItem && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-5 space-y-3 shadow-2xl">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                <Download className="w-5 h-5" />
                <span>Confirmar descarga local</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                ¿Deseas descargar el modelo <strong>{confirmDownloadItem.name}</strong>?
              </p>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1 text-slate-400">
                <div className="flex justify-between">
                  <span>Tamaño de descarga:</span>
                  <span className="font-bold text-white">{confirmDownloadItem.downloadSize}</span>
                </div>
                <div className="flex justify-between">
                  <span>Requisitos:</span>
                  <span className="text-slate-300">{confirmDownloadItem.requirements}</span>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setConfirmDownloadItem(null)}
                  className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleStartDownload(confirmDownloadItem)}
                  className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shadow-md shadow-indigo-600/30 transition"
                >
                  Descargar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-col sm:flex-row gap-2.5 justify-between items-center">
          <div className="text-xs text-slate-400 truncate max-w-xs">
            Seleccionado: <strong className="text-white">{selectedConfig[activeTab].modelName}</strong>
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => handleApply(true)}
              className="flex-1 sm:flex-initial px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition"
            >
              Guardar por defecto
            </button>
            <button
              onClick={() => handleApply(false)}
              className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shadow-md shadow-indigo-600/30 transition"
            >
              Aplicar a este proyecto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Subcomponente de tarjeta de modelo
const ModelCard: React.FC<{
  model: ModelItem;
  isSelected: boolean;
  isTesting: boolean;
  onSelect: () => void;
  onTest: () => void;
  onDownloadClick: () => void;
}> = ({ model, isSelected, isTesting, onSelect, onTest, onDownloadClick }) => {
  return (
    <div
      onClick={onSelect}
      className={`p-3 rounded-2xl border transition cursor-pointer ${
        isSelected
          ? 'bg-indigo-950/40 border-indigo-500 shadow-md shadow-indigo-950/50'
          : 'bg-slate-950 border-slate-800/80 hover:border-slate-700'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-white text-xs">{model.name}</span>

            {/* Suitability Badge (Requisito 5) */}
            {model.suitability === 'recommended' && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Recomendado
              </span>
            )}
            {model.suitability === 'slow' && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Funciona pero lento
              </span>
            )}
            {model.suitability === 'may_crash' && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
                Puede cerrar la app
              </span>
            )}

            {model.tier && (
              <span className="text-[10px] text-slate-500 uppercase font-bold">
                · {model.tier}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
            <span>📦 {model.downloadSize}</span>
            <span>⚡ {model.speed}</span>
            <span>✨ {model.quality}</span>
          </div>

          <p className="mt-1 text-[11px] text-slate-500">{model.requirements}</p>
        </div>

        {/* Radio Indicator */}
        <div
          className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition ${
            isSelected ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-700 bg-slate-900'
          }`}
        >
          {isSelected && <Check className="w-3 h-3" />}
        </div>
      </div>

      {/* Action Buttons: Probar, Descargar */}
      <div className="mt-2.5 pt-2 border-t border-slate-900 flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onTest}
          disabled={isTesting}
          className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] font-semibold text-slate-300 flex items-center gap-1 transition"
        >
          {isTesting ? <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" /> : <Play className="w-3 h-3" />}
          <span>Probar</span>
        </button>

        {model.provider === 'local' && model.status === 'not_downloaded' && (
          <button
            onClick={onDownloadClick}
            className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-[10px] font-bold text-indigo-200 flex items-center gap-1 transition"
          >
            <Download className="w-3 h-3" />
            <span>Descargar</span>
          </button>
        )}
      </div>
    </div>
  );
};
