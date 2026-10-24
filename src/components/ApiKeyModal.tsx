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
  Zap,
  Radio,
} from 'lucide-react';
import { PROVIDERS_CATALOG, testProviderConnection } from '../services/llmService';
import { speechService } from '../services/speechService';
import type {
  LLMProviderId,
  ProviderConfig,
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
}

const PROVIDER_ORDER: LLMProviderId[] = [
  'gemini',
  'openai',
  'claude',
  'deepseek',
  'kimi',
  'glm',
  'custom',
];

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  providerConfig,
  onSaveProviderConfig,
  voiceSettings,
  onSaveVoiceSettings,
  downloadProgress,
}) => {
  const [draftConfig, setDraftConfig] = useState<ProviderConfig>(providerConfig);
  const [draftVoice, setDraftVoice] = useState<VoiceSettings>(voiceSettings);
  const [activeTab, setActiveTab] = useState<'voice' | 'ai'>('voice');
  const [showKey, setShowKey] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isPreloadingVoice, setIsPreloadingVoice] = useState(false);
  const [preloadDoneMsg, setPreloadDoneMsg] = useState<string | null>(null);
  const [testState, setTestState] = useState<{
    loading: boolean;
    ok?: boolean;
    message?: string;
  }>({ loading: false });

  useEffect(() => {
    setDraftConfig(providerConfig);
    setDraftVoice(voiceSettings);
    setTestState({ loading: false });
    setPreloadDoneMsg(null);
  }, [providerConfig, voiceSettings, isOpen]);

  useEffect(() => {
    const updateVoices = () => {
      const voices = speechService.getVoices();
      setAvailableVoices(voices);
      if (!draftVoice.browserVoiceURI && voices.length > 0) {
        const best = speechService.getBestDefaultVoiceURI();
        setDraftVoice((prev) => ({ ...prev, browserVoiceURI: best }));
      }
    };

    updateVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentProvider = PROVIDERS_CATALOG[draftConfig.providerId];
  const currentApiKey = draftConfig.apiKeys[draftConfig.providerId] || '';
  const currentModel =
    draftConfig.selectedModels[draftConfig.providerId] || currentProvider.defaultModel;
  const currentBaseUrl =
    draftConfig.customBaseUrls[draftConfig.providerId] || currentProvider.defaultBaseUrl;

  const handleSelectProvider = (id: LLMProviderId) => {
    setDraftConfig((prev) => ({ ...prev, providerId: id }));
    setTestState({ loading: false });
  };

  const handleKeyChange = (val: string) => {
    setDraftConfig((prev) => ({
      ...prev,
      apiKeys: { ...prev.apiKeys, [prev.providerId]: val },
    }));
  };

  const handleModelChange = (val: string) => {
    setDraftConfig((prev) => ({
      ...prev,
      selectedModels: { ...prev.selectedModels, [prev.providerId]: val },
    }));
  };

  const handleBaseUrlChange = (val: string) => {
    setDraftConfig((prev) => ({
      ...prev,
      customBaseUrls: { ...prev.customBaseUrls, [prev.providerId]: val },
    }));
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
      await speechService.preloadPiperVoice(draftVoice.piperVoiceId || 'pt_BR-faber-medium');
      setPreloadDoneMsg(
        'Voz neural baixada e salva em cache permanente no navegador! Pronta para leitura 100% offline.'
      );
    } catch (err: any) {
      setPreloadDoneMsg(`Erro ao baixar modelo: ${err?.message || 'Verifique sua conexão.'}`);
    } finally {
      setIsPreloadingVoice(false);
    }
  };

  const handleTestVoiceSample = () => {
    speechService.speak({
      text: 'Atenção para esta dica de prova! Enquanto na esfera privada o particular pode fazer tudo que a lei não proíbe, na Administração Pública o gestor só age quando a lei autoriza.',
      blockType: 'alert',
      settings: draftVoice,
      geminiKeyFallback: draftConfig.apiKeys.gemini,
      openAiKeyFallback: draftConfig.apiKeys.openai,
    });
  };

  const handleSaveAll = () => {
    onSaveProviderConfig(draftConfig);
    onSaveVoiceSettings(draftVoice);
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
                Voz Neural Zero-API & Inteligência Artificial
              </h2>
              <p className="text-xs text-slate-400">
                Motores neurais offline/expressivos sem chave de API + Cérebro do Professor IA
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
            <span>1. Voz Neural Expressiva (Sem API)</span>
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
            <span>2. Cérebro do Professor (Gemini, OpenAI...)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'voice' ? (
            <div className="space-y-5">
              {/* Zero-API Expressive Neural Engines */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Motores Neurais Zero-API (100% Gratuitos & Com Emoção)
                    </label>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
                      Sem Chave de API
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {/* 1. Piper Neural Offline WASM */}
                    <button
                      type="button"
                      onClick={() =>
                        setDraftVoice((prev) => ({ ...prev, ttsEngine: 'piper_wasm' }))
                      }
                      className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                        draftVoice.ttsEngine === 'piper_wasm'
                          ? 'bg-emerald-600/20 border-emerald-500 text-white shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold flex items-center gap-1.5">
                            <Cpu className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            Piper Neural WASM
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                            Padrão
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                          Roda 100% dentro do seu navegador via ONNX/WASM. Baixa uma única vez (~18MB) e funciona até sem internet!
                        </p>
                      </div>
                    </button>

                    {/* 2. Kokoro-82M WebGPU/WASM */}
                    <button
                      type="button"
                      onClick={() =>
                        setDraftVoice((prev) => ({ ...prev, ttsEngine: 'kokoro_webgpu' }))
                      }
                      className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                        draftVoice.ttsEngine === 'kokoro_webgpu'
                          ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            Kokoro-82M Neural
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                            Ultra Realista
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                          Modelo estado-da-arte de 82M parâmetros (WebGPU/WASM) com vozes nativas PT-BR (Dora, Alex e Santa).
                        </p>
                      </div>
                    </button>

                    {/* 3. Edge Neural Stream */}
                    <button
                      type="button"
                      onClick={() =>
                        setDraftVoice((prev) => ({ ...prev, ttsEngine: 'edge_neural' }))
                      }
                      className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                        draftVoice.ttsEngine === 'edge_neural'
                          ? 'bg-violet-600/20 border-violet-500 text-white shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold flex items-center gap-1.5">
                            <Radio className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                            Edge Neural Studio
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 font-bold">
                            Instantâneo
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                          Vozes neurais da Microsoft (Francisca, Antonio e Thalita) com entonação fluida sem precisar de chave.
                        </p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Secondary API / System Engines */}
                <div className="pt-2 border-t border-slate-800/80">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Ou use Motores em Nuvem (Com API Key) / Sistema:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setDraftVoice((prev) => ({ ...prev, ttsEngine: 'gemini_tts' }))
                      }
                      className={`px-2.5 py-2 rounded-lg border text-left text-xs transition-all ${
                        draftVoice.ttsEngine === 'gemini_tts'
                          ? 'bg-indigo-600/20 border-indigo-500 text-white font-bold'
                          : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Gemini Audio API
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftVoice((prev) => ({ ...prev, ttsEngine: 'openai_cloud' }))
                      }
                      className={`px-2.5 py-2 rounded-lg border text-left text-xs transition-all ${
                        draftVoice.ttsEngine === 'openai_cloud'
                          ? 'bg-indigo-600/20 border-indigo-500 text-white font-bold'
                          : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      OpenAI TTS API
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftVoice((prev) => ({ ...prev, ttsEngine: 'elevenlabs' }))
                      }
                      className={`px-2.5 py-2 rounded-lg border text-left text-xs transition-all ${
                        draftVoice.ttsEngine === 'elevenlabs'
                          ? 'bg-indigo-600/20 border-indigo-500 text-white font-bold'
                          : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      ElevenLabs API
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftVoice((prev) => ({ ...prev, ttsEngine: 'browser' }))
                      }
                      className={`px-2.5 py-2 rounded-lg border text-left text-xs transition-all ${
                        draftVoice.ttsEngine === 'browser'
                          ? 'bg-indigo-600/20 border-indigo-500 text-white font-bold'
                          : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Voz do Sistema
                    </button>
                  </div>
                </div>

                {/* Engine-Specific Configuration */}
                {draftVoice.ttsEngine === 'piper_wasm' && (
                  <div className="space-y-3 pt-2 border-t border-slate-800/80">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Voz Neural Offline (Português)
                        </label>
                        <select
                          value={draftVoice.piperVoiceId || 'pt_BR-faber-medium'}
                          onChange={(e) =>
                            setDraftVoice((prev) => ({
                              ...prev,
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
                            <span>Baixando Modelo Neural...</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Pré-Baixar Voz Offline (OPFS)</span>
                          </>
                        )}
                      </button>
                    </div>

                    {preloadDoneMsg && (
                      <p className="text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
                        {preloadDoneMsg}
                      </p>
                    )}
                  </div>
                )}

                {draftVoice.ttsEngine === 'kokoro_webgpu' && (
                  <div className="space-y-2 pt-2 border-t border-slate-800/80">
                    <label className="block text-xs font-medium text-slate-300">
                      Timbre Neural Kokoro-82M (Português Brasileiro Nativo)
                    </label>
                    <select
                      value={draftVoice.kokoroVoiceId || 'pf_dora'}
                      onChange={(e) =>
                        setDraftVoice((prev) => ({
                          ...prev,
                          kokoroVoiceId: e.target.value as any,
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100"
                    >
                      <option value="pf_dora">
                        Dora (pf_dora • Feminina Calorosa, Expressiva e Natural — Recomendada)
                      </option>
                      <option value="pm_alex">
                        Alex (pm_alex • Masculina Dinâmica de Professor)
                      </option>
                      <option value="pm_santa">
                        Santa (pm_santa • Masculina Grave e Serena)
                      </option>
                    </select>
                    <p className="text-[11px] text-slate-400">
                      ✨ Na primeira leitura, o modelo neural Kokoro (~80MB) é baixado automaticamente e salvo em cache no navegador.
                    </p>
                  </div>
                )}

                {draftVoice.ttsEngine === 'edge_neural' && (
                  <div className="space-y-2 pt-2 border-t border-slate-800/80">
                    <label className="block text-xs font-medium text-slate-300">
                      Timbre Microsoft Edge Neural (pt-BR)
                    </label>
                    <select
                      value={draftVoice.edgeVoiceId || 'pt-BR-FranciscaNeural'}
                      onChange={(e) =>
                        setDraftVoice((prev) => ({
                          ...prev,
                          edgeVoiceId: e.target.value as any,
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100"
                    >
                      <option value="pt-BR-FranciscaNeural">
                        Francisca Neural (Feminina • Entonação Humana Calorosa e Fluida)
                      </option>
                      <option value="pt-BR-ThalitaMultilingualNeural">
                        Thalita Multilingual Neural (Feminina • Expressiva de Estúdio)
                      </option>
                      <option value="pt-BR-AntonioNeural">
                        Antonio Neural (Masculina • Didática e Firme para Aulas)
                      </option>
                    </select>
                  </div>
                )}

                {draftVoice.ttsEngine === 'gemini_tts' && (
                  <div className="space-y-2 pt-2 border-t border-slate-800/80">
                    <label className="block text-xs font-medium text-slate-300">
                      Timbre da Voz Neural Gemini
                    </label>
                    <select
                      value={draftVoice.geminiVoiceName || 'Kore'}
                      onChange={(e) =>
                        setDraftVoice((prev) => ({
                          ...prev,
                          geminiVoiceName: e.target.value as any,
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100"
                    >
                      <option value="Kore">Kore (Feminina calorosa, firme e muito didática)</option>
                      <option value="Aoede">Aoede (Feminina expressiva e natural)</option>
                      <option value="Puck">Puck (Masculina dinâmica e entusiasmada)</option>
                      <option value="Charon">Charon (Masculina serena e articulada)</option>
                      <option value="Fenrir">Fenrir (Masculina grave com presença de aula)</option>
                    </select>
                    {!draftConfig.apiKeys.gemini && (
                      <p className="text-[11px] text-amber-300">
                        💡 Dica: Insira sua chave gratuita do Google Gemini na aba "2. Cérebro do Professor" para usar esta opção, ou escolha o Piper/Kokoro acima sem precisar de chave!
                      </p>
                    )}
                  </div>
                )}

                {draftVoice.ttsEngine === 'openai_cloud' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Voz OpenAI
                      </label>
                      <select
                        value={draftVoice.cloudVoiceId}
                        onChange={(e) =>
                          setDraftVoice((prev) => ({
                            ...prev,
                            cloudVoiceId: e.target.value as any,
                          }))
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100"
                      >
                        <option value="nova">Nova (Feminina enérgica e clara)</option>
                        <option value="shimmer">Shimmer (Feminina expressiva)</option>
                        <option value="onyx">Onyx (Masculina grave de professor)</option>
                        <option value="alloy">Alloy (Equilibrada)</option>
                        <option value="echo">Echo (Didática e pausada)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        API Key OpenAI (para Áudio)
                      </label>
                      <input
                        type="password"
                        value={draftVoice.openAiTtsApiKey || draftConfig.apiKeys.openai || ''}
                        onChange={(e) =>
                          setDraftVoice((prev) => ({
                            ...prev,
                            openAiTtsApiKey: e.target.value,
                          }))
                        }
                        placeholder="sk-proj-..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                      />
                    </div>
                  </div>
                )}

                {draftVoice.ttsEngine === 'elevenlabs' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        API Key ElevenLabs
                      </label>
                      <input
                        type="password"
                        value={draftVoice.elevenLabsApiKey || ''}
                        onChange={(e) =>
                          setDraftVoice((prev) => ({
                            ...prev,
                            elevenLabsApiKey: e.target.value,
                          }))
                        }
                        placeholder="xi-api-key..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Voice ID (ElevenLabs)
                      </label>
                      <input
                        type="text"
                        value={draftVoice.elevenLabsVoiceId || 'EXAVITQu4vr4xnSDxMaL'}
                        onChange={(e) =>
                          setDraftVoice((prev) => ({
                            ...prev,
                            elevenLabsVoiceId: e.target.value,
                          }))
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                      />
                    </div>
                  </div>
                )}

                {draftVoice.ttsEngine === 'browser' && (
                  <div className="pt-2 border-t border-slate-800/80">
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Voz Neural do Dispositivo (Vozes "Natural / Neural" ranqueadas no topo)
                    </label>
                    <select
                      value={draftVoice.browserVoiceURI}
                      onChange={(e) =>
                        setDraftVoice((prev) => ({
                          ...prev,
                          browserVoiceURI: e.target.value,
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100"
                    >
                      {availableVoices.length === 0 && (
                        <option value="">Voz padrão do sistema (pt-BR)</option>
                      )}
                      {availableVoices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </select>
                  </div>
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
                      <span className="text-slate-300 font-medium">Velocidade da Aula</span>
                      <span className="text-indigo-400 font-bold">
                        {draftVoice.rate.toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.75"
                      max="1.8"
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
                      <span>Testar Entonação da Voz</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Study Method Checkboxes */}
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
                    <span className="block text-xs font-semibold text-emerald-300">
                      Pré-Carregamento Lookahead (Zero Latência entre Frases)
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      Enquanto a frase atual é lida, o motor neural já sintetiza a próxima frase em segundo plano para transições instantâneas.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftVoice.autoFlashcardsOnTopicEnd}
                    onChange={(e) =>
                      setDraftVoice((prev) => ({
                        ...prev,
                        autoFlashcardsOnTopicEnd: e.target.checked,
                      }))
                    }
                    className="mt-1 rounded accent-indigo-500"
                  />
                  <div>
                    <span className="block text-xs font-semibold text-slate-200">
                      Pausa Automática para Flashcards ao Fim de Cada Tópico (Active Recall)
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      Ao concluir um tópico da apostila, pausa a leitura e lança 2 a 3 perguntas de fixação na aba lateral.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftVoice.sanitizeHeadersFooters}
                    onChange={(e) =>
                      setDraftVoice((prev) => ({
                        ...prev,
                        sanitizeHeadersFooters: e.target.checked,
                      }))
                    }
                    className="mt-1 rounded accent-indigo-500"
                  />
                  <div>
                    <span className="block text-xs font-semibold text-slate-200">
                      Filtro Inteligente para PDFs do Estratégia & Gran Cursos
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      Ignora automaticamente cabeçalhos repetitivos, números de página, CPF e rodapés de copyright.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftVoice.autoResumeAfterAnswer}
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
                      Retomar leitura do PDF após explicação do Professor
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      Assim que o Professor terminar de responder sua dúvida por voz, a leitura da apostila continua de onde parou.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          ) : (
            /* AI Provider Tab */
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Escolha o Cérebro da IA (Modo Professor & Flashcards)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PROVIDER_ORDER.map((id) => {
                    const p = PROVIDERS_CATALOG[id];
                    const isSelected = draftConfig.providerId === id;
                    const hasKeyConfigured = Boolean(draftConfig.apiKeys[id]?.trim());
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleSelectProvider(id)}
                        className={`px-3 py-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                          isSelected
                            ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                            : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xs font-bold">{p.shortName}</span>
                          {hasKeyConfigured && (
                            <span
                              className="w-2 h-2 rounded-full bg-emerald-400"
                              title="Chave configurada"
                            />
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 truncate mt-1">
                          {p.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/90 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">
                      Chave de API — {currentProvider.name}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Salva exclusivamente no navegador do seu dispositivo
                    </p>
                  </div>
                  <a
                    href={currentProvider.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
                  >
                    <span>Gerar Chave</span>
                    <ExternalLink className="w-3 h-3" />
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
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Modelo Sugerido
                    </label>
                    <select
                      value={
                        currentProvider.models.some((m) => m.id === currentModel)
                          ? currentModel
                          : '__custom__'
                      }
                      onChange={(e) => {
                        if (e.target.value !== '__custom__') {
                          handleModelChange(e.target.value);
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                    >
                      {currentProvider.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                      <option value="__custom__">Outro modelo...</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      ID do Modelo
                    </label>
                    <input
                      type="text"
                      value={currentModel}
                      onChange={(e) => handleModelChange(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Endpoint Base (Opcional)
                  </label>
                  <input
                    type="text"
                    value={currentBaseUrl}
                    onChange={(e) => handleBaseUrlChange(e.target.value)}
                    className="w-full bg-slate-900/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 font-mono"
                  />
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
                        <span>Testando...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Testar Conexão</span>
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
            Salvar Configurações
          </button>
        </div>
      </div>
    </div>
  );
};
