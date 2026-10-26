import React, { useEffect, useState } from 'react';
import {
  X,
  KeyRound,
  Volume2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
  Play,
  Download,
  Cpu,
  Activity,
  RefreshCw,
  HardDrive,
} from 'lucide-react';
import {
  fetchAvailableGeminiModels,
  PROVIDERS_CATALOG,
  testProviderConnection,
} from '../services/llmService';
import { speechService } from '../services/speechService';
import type {
  EngineStatus,
  GeminiModelOption,
  ProviderConfig,
  VoiceDiagnosticResult,
  VoiceModelDownloadProgress,
  VoiceSettings,
} from '../types';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  providerConfig: ProviderConfig;
  onSaveProviderConfig: (config: ProviderConfig) => void;
  voiceSettings: VoiceSettings;
  onSaveVoiceSettings: (settings: VoiceSettings) => void;
  downloadProgress?: VoiceModelDownloadProgress | null;
  engineStatus?: EngineStatus | null;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  providerConfig,
  onSaveProviderConfig,
  voiceSettings,
  onSaveVoiceSettings,
  downloadProgress,
  engineStatus,
}) => {
  const [draftConfig, setDraftConfig] = useState<ProviderConfig>(providerConfig);
  const [draftVoice, setDraftVoice] = useState<VoiceSettings>(voiceSettings);
  const [activeTab, setActiveTab] = useState<'voice' | 'ai'>('voice');
  const [showKey, setShowKey] = useState(false);
  const [geminiModelsList, setGeminiModelsList] = useState<GeminiModelOption[]>(
    PROVIDERS_CATALOG.gemini.models
  );
  const [isSyncingModels, setIsSyncingModels] = useState(false);
  const [isPreloadingVoice, setIsPreloadingVoice] = useState(false);
  const [isVoiceCachedLocally, setIsVoiceCachedLocally] = useState(false);
  const [preloadDoneMsg, setPreloadDoneMsg] = useState<string | null>(null);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [diagnosticResults, setDiagnosticResults] = useState<
    VoiceDiagnosticResult[] | null
  >(null);
  const [testState, setTestState] = useState<{
    loading: boolean;
    ok?: boolean;
    message?: string;
  }>({ loading: false });

  useEffect(() => {
    setDraftConfig(providerConfig);
    setDraftVoice({
      ...voiceSettings,
      ttsEngine: 'piper_wasm',
    });
    setTestState({ loading: false });
    setPreloadDoneMsg(null);
  }, [providerConfig, voiceSettings, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    speechService
      .isPiperVoiceCachedLocally(draftVoice.piperVoiceId || 'pt_BR-faber-medium')
      .then((cached: boolean) => {
        if (mounted) setIsVoiceCachedLocally(cached);
      });
    return () => {
      mounted = false;
    };
  }, [isOpen, draftVoice.piperVoiceId]);

  if (!isOpen) return null;

  const currentProvider = PROVIDERS_CATALOG.gemini;
  const currentApiKey = draftConfig.apiKeys.gemini || '';
  const currentModel =
    draftConfig.selectedModels.gemini || currentProvider.defaultModel;
  const currentBaseUrl =
    draftConfig.customBaseUrls.gemini || currentProvider.defaultBaseUrl;

  const handleKeyChange = (val: string) => {
    setDraftConfig((prev) => ({
      ...prev,
      providerId: 'gemini',
      apiKeys: { ...prev.apiKeys, gemini: val },
    }));
  };

  const handleModelChange = (val: string) => {
    setDraftConfig((prev) => ({
      ...prev,
      providerId: 'gemini',
      selectedModels: { ...prev.selectedModels, gemini: val },
    }));
  };

  const handleBaseUrlChange = (val: string) => {
    setDraftConfig((prev) => ({
      ...prev,
      providerId: 'gemini',
      customBaseUrls: { ...prev.customBaseUrls, gemini: val },
    }));
  };

  const handleSyncGeminiModels = async () => {
    if (!currentApiKey.trim()) return;
    setIsSyncingModels(true);
    try {
      const models = await fetchAvailableGeminiModels(currentApiKey);
      setGeminiModelsList(models);
      setTestState({
        loading: false,
        ok: true,
        message: `${models.length} modelos Gemini encontrados na sua chave do Google AI Studio!`,
      });
    } catch (err: any) {
      setTestState({
        loading: false,
        ok: false,
        message: err?.message || 'Não foi possível listar modelos da chave.',
      });
    } finally {
      setIsSyncingModels(false);
    }
  };

  const handleTestConnection = async () => {
    setTestState({ loading: true });
    onSaveProviderConfig(draftConfig);
    const res = await testProviderConnection(draftConfig);
    setTestState({ loading: false, ok: res.ok, message: res.message });
  };

  const handlePreloadPiperModel = async () => {
    setIsPreloadingVoice(true);
    setPreloadDoneMsg(null);
    try {
      await speechService.preloadPiperVoice(
        draftVoice.piperVoiceId || 'pt_BR-faber-medium'
      );
      setIsVoiceCachedLocally(true);
      setPreloadDoneMsg(
        'Voz Piper Neural + WASM salvos permanentemente no navegador (OPFS + CacheStorage)! Ela não precisará recarregar quando você reabrir o site.'
      );
    } catch (err: any) {
      setPreloadDoneMsg(
        `Erro ao baixar modelo: ${err?.message || 'Verifique sua conexão.'}`
      );
    } finally {
      setIsPreloadingVoice(false);
    }
  };

  const handleRunDiagnostics = async () => {
    setIsRunningDiagnostics(true);
    setDiagnosticResults(null);
    try {
      const results = await speechService.runVoiceDiagnostics(draftVoice);
      setDiagnosticResults(results);
      const cached = await speechService.isPiperVoiceCachedLocally(
        draftVoice.piperVoiceId || 'pt_BR-faber-medium'
      );
      setIsVoiceCachedLocally(cached);
    } finally {
      setIsRunningDiagnostics(false);
    }
  };

  const handleTestVoiceSample = () => {
    speechService.speak({
      text: 'Atenção para esta dica de prova! Enquanto na esfera privada o particular pode fazer tudo que a lei não proíbe, na Administração Pública o gestor só age quando a lei autoriza.',
      blockType: 'alert',
      settings: draftVoice,
    });
  };

  const handleSaveAll = () => {
    onSaveProviderConfig(draftConfig);
    onSaveVoiceSettings({
      ...draftVoice,
      ttsEngine: 'piper_wasm',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Piper Neural & Google AI Studio (Gemini)
              </h2>
              <p className="text-xs text-slate-400">
                Voz neural com cache permanente (não recarrega ao abrir o site) + IA Gemini
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 pt-3 border-b border-slate-800 flex gap-5 bg-slate-950/40">
          <button
            type="button"
            onClick={() => setActiveTab('voice')}
            className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'voice'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Volume2 className="w-4 h-4" />
            <span>1. Voz Piper Neural (Cache Permanente)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'ai'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>2. Google AI Studio (Gemini Grátis)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'voice' ? (
            <div className="space-y-5">
              {/* Exclusive Piper Neural Engine Card */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                      <Cpu className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-white">
                          Motor Oficial: Piper Neural WASM (Offline)
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
                          OPFS + CacheStorage Permanente
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                        Os arquivos do modelo neural ONNX e do fonemizador WASM ficam gravados no disco local do navegador — abertura instantânea sem baixar de novo!
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isVoiceCachedLocally ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold">
                        <HardDrive className="w-3.5 h-3.5" />
                        Salvo no Dispositivo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-semibold">
                        Download único pendente
                      </span>
                    )}
                  </div>
                </div>

                {/* Piper Voice Selector + Preload Button */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Timbre da Voz Piper Neural (Português)
                    </label>
                    <select
                      value={draftVoice.piperVoiceId || 'pt_BR-faber-medium'}
                      onChange={(e) =>
                        setDraftVoice((prev) => ({
                          ...prev,
                          ttsEngine: 'piper_wasm',
                          piperVoiceId: e.target.value as any,
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100"
                    >
                      <option value="pt_BR-faber-medium">
                        Faber Neural (pt-BR • Masculina Didática de Estúdio — Recomendada)
                      </option>
                      <option value="pt_BR-edresson-low">
                        Edresson Neural (pt-BR • Masculina Ultra-Leve e Rápida)
                      </option>
                      <option value="pt_PT-tugão-medium">
                        Tugão Neural (pt-PT • Masculina Articulada)
                      </option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handlePreloadPiperModel}
                    disabled={isPreloadingVoice}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-200 border border-emerald-500/40 text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    {isPreloadingVoice ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Salvando no Cache Permanente...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span>
                          {isVoiceCachedLocally
                            ? 'Verificar / Atualizar Cache Local'
                            : 'Baixar e Fixar Voz no Navegador'}
                        </span>
                      </>
                    )}
                  </button>
                </div>

                {preloadDoneMsg && (
                  <p className="text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
                    {preloadDoneMsg}
                  </p>
                )}

                {/* Live Download Progress Indicator when downloading offline neural model */}
                {downloadProgress?.isDownloading && (
                  <div className="bg-indigo-950/60 border border-indigo-500/40 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-indigo-200 font-semibold flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                        {downloadProgress.statusText}
                      </span>
                      <span className="text-indigo-300 font-mono font-bold">
                        {downloadProgress.percent}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-200"
                        style={{ width: `${downloadProgress.percent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Speed & Test Sample */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-300 font-medium">
                        Velocidade da Aula
                      </span>
                      <span className="text-indigo-400 font-bold">
                        {draftVoice.rate.toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.60"
                      max="1.50"
                      step="0.05"
                      value={draftVoice.rate}
                      onChange={(e) =>
                        setDraftVoice((prev) => ({
                          ...prev,
                          rate: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-indigo-500"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleTestVoiceSample}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 border border-indigo-500/40 text-xs font-bold transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Testar Voz Piper Neural</span>
                    </button>
                  </div>
                </div>

                {/* Live Engine Status Feedback Banner */}
                {engineStatus && engineStatus.state !== 'idle' && (
                  <div
                    className={`rounded-xl px-3.5 py-2.5 border text-xs flex items-start justify-between gap-3 ${
                      engineStatus.state === 'failed'
                        ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
                        : engineStatus.state === 'loading'
                          ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-200'
                          : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {engineStatus.state === 'loading' ? (
                        <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5 text-indigo-400" />
                      ) : engineStatus.state === 'failed' ? (
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                      )}
                      <div>
                        <span className="font-bold block">
                          {engineStatus.state === 'playing' &&
                            `Piper Neural ativo: ${engineStatus.voiceLabel}${
                              engineStatus.latencyMs
                                ? ` (${engineStatus.latencyMs}ms)`
                                : ''
                            }`}
                          {engineStatus.state === 'loading' &&
                            `Sintetizando áudio neural: ${engineStatus.voiceLabel}...`}
                          {engineStatus.state === 'failed' &&
                            `Falha ao sintetizar: ${engineStatus.voiceLabel}`}
                        </span>
                        {engineStatus.error && (
                          <span className="block text-[11px] opacity-90 mt-0.5">
                            Motivo: {engineStatus.error}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Piper Voice Diagnostic Panel */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-indigo-400" />
                      <span>Diagnóstico de Latência & Cache do Piper Neural</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Verifica se o modelo neural já está em memória e testa a velocidade de geração.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRunDiagnostics}
                    disabled={isRunningDiagnostics}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-200 border border-emerald-500/40 text-xs font-bold transition-colors shrink-0 disabled:opacity-50"
                  >
                    {isRunningDiagnostics ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Verificando Piper...</span>
                      </>
                    ) : (
                      <>
                        <Activity className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Testar Piper Agora</span>
                      </>
                    )}
                  </button>
                </div>

                {diagnosticResults && (
                  <div className="space-y-2 pt-2 border-t border-slate-800/80">
                    {diagnosticResults.map((res) => (
                      <div
                        key={res.engine}
                        className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                          res.ok
                            ? 'bg-slate-900/90 border-emerald-500/30'
                            : 'bg-slate-900/60 border-rose-500/30'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {res.ok ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                            )}
                            <span className="text-xs font-bold text-slate-100">
                              {res.voiceLabel}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                              {res.latencyMs}ms
                            </span>
                          </div>
                          {res.error && (
                            <p className="text-[11px] text-rose-300 mt-1">
                              {res.error}
                            </p>
                          )}
                        </div>

                        {res.ok && res.audioBlob && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                speechService.playAudioBlobDirect(
                                  res.audioBlob!,
                                  draftVoice.rate
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>Ouvir Amostra</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reading Preferences */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftVoice.prefetchNextSentence ?? true}
                    onChange={(e) =>
                      setDraftVoice((prev) => ({
                        ...prev,
                        prefetchNextSentence: e.target.checked,
                      }))
                    }
                    className="mt-1 rounded accent-indigo-500"
                  />
                  <div>
                    <span className="block text-xs font-semibold text-slate-200">
                      Pré-Carregamento Lookahead (Zero Latência entre Frases)
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      Enquanto a frase atual é lida, o Piper já sintetiza a próxima frase em segundo plano.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftVoice.autoResumeAfterAnswer ?? true}
                    onChange={(e) =>
                      setDraftVoice((prev) => ({
                        ...prev,
                        autoResumeAfterAnswer: e.target.checked,
                      }))
                    }
                    className="mt-1 rounded accent-indigo-500"
                  />
                  <div>
                    <span className="block text-xs font-semibold text-slate-200">
                      Retomar Leitura do PDF Após Explicação da IA
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      Assim que o Professor IA terminar de explicar um trecho em dúvida, volta para a leitura do texto automaticamente.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          ) : (
            /* TAB 2: Exclusive Google AI Studio (Gemini Free Tier) */
            <div className="space-y-5">
              <div className="bg-slate-950/60 border border-slate-800/90 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <span>Chave de API — Google AI Studio (Gemini)</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
                        API Grátis
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Usada para Extração Cirúrgica de PDFs (estilo Demo), Modo Professor e Flashcards
                    </p>
                  </div>
                  <a
                    href={currentProvider.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold shrink-0"
                  >
                    <span>Gerar Key no AI Studio</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={currentApiKey}
                    onChange={(e) => handleKeyChange(e.target.value)}
                    placeholder={currentProvider.keyPlaceholder}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 focus:outline-none rounded-xl px-3.5 py-2.5 pr-10 text-sm text-slate-100 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    {showKey ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Free Tier Models Grid */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold uppercase tracking-wider text-indigo-300">
                      Modelos Gratuitos do Google AI Studio
                    </label>
                    <button
                      type="button"
                      disabled={!currentApiKey.trim() || isSyncingModels}
                      onClick={handleSyncGeminiModels}
                      className="text-[11px] font-semibold text-emerald-300 hover:text-emerald-200 inline-flex items-center gap-1 disabled:opacity-40"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${isSyncingModels ? 'animate-spin' : ''}`}
                      />
                      <span>Sincronizar Modelos da Minha Chave</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {geminiModelsList.slice(0, 6).map((m) => {
                      const isSelected = currentModel === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => handleModelChange(m.id)}
                          className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                            isSelected
                              ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold font-mono text-indigo-200 truncate">
                              {m.id}
                            </span>
                            {m.freeTierBadge && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold shrink-0">
                                {m.freeTierBadge}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                            {m.description || m.label}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      ID Exato do Modelo Gemini
                    </label>
                    <input
                      type="text"
                      value={currentModel}
                      onChange={(e) => handleModelChange(e.target.value)}
                      placeholder="gemini-3.5-flash-lite"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Endpoint API (v1beta)
                    </label>
                    <input
                      type="text"
                      value={currentBaseUrl}
                      onChange={(e) => handleBaseUrlChange(e.target.value)}
                      className="w-full bg-slate-900/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 font-mono"
                    />
                  </div>
                </div>

                {/* AI PDF Deep Extraction Option */}
                <div className="pt-2 border-t border-slate-800">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draftConfig.aiSanitizePdf ?? true}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          aiSanitizePdf: e.target.checked,
                        }))
                      }
                      className="mt-1 rounded accent-emerald-500"
                    />
                    <div>
                      <span className="block text-xs font-bold text-emerald-300">
                        ✨ Extração Cirúrgica de Conteúdo com Gemini (Estilo Demo)
                      </span>
                      <span className="block text-[11px] text-slate-400 leading-relaxed">
                        Ao enviar um PDF e escolher as páginas, o Gemini extrai literalmente apenas o texto de estudo destacado (títulos, explicações, alertas e questões), descartando capas, sumários, logos, cabeçalhos e rodapés.
                      </span>
                    </div>
                  </label>
                </div>

                <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testState.loading || !currentApiKey.trim()}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-colors disabled:opacity-40"
                  >
                    {testState.loading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Testando Gemini...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Testar Conexão no AI Studio</span>
                      </>
                    )}
                  </button>

                  {testState.message && (
                    <div
                      className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl border flex-1 ${
                        testState.ok
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                      }`}
                    >
                      {testState.ok ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                      )}
                      <span className="line-clamp-2">{testState.message}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSaveAll}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25 transition-all"
          >
            Salvar na Minha Conta
          </button>
        </div>
      </div>
    </div>
  );
};
