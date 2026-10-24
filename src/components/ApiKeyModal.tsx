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
} from 'lucide-react';
import { PROVIDERS_CATALOG, testProviderConnection } from '../services/llmService';
import { speechService } from '../services/speechService';
import type { LLMProviderId, ProviderConfig, VoiceSettings } from '../types';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  providerConfig: ProviderConfig;
  onSaveProviderConfig: (config: ProviderConfig) => void;
  voiceSettings: VoiceSettings;
  onSaveVoiceSettings: (settings: VoiceSettings) => void;
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
}) => {
  const [draftConfig, setDraftConfig] = useState<ProviderConfig>(providerConfig);
  const [draftVoice, setDraftVoice] = useState<VoiceSettings>(voiceSettings);
  const [activeTab, setActiveTab] = useState<'ai' | 'voice'>('ai');
  const [showKey, setShowKey] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [testState, setTestState] = useState<{
    loading: boolean;
    ok?: boolean;
    message?: string;
  }>({ loading: false });

  useEffect(() => {
    setDraftConfig(providerConfig);
    setDraftVoice(voiceSettings);
    setTestState({ loading: false });
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

  const handleTestVoiceSample = () => {
    speechService.speak({
      text: `Olá! Esta é a voz configurada para ler seus documentos PDF e responder suas dúvidas usando ${currentProvider.name}.`,
      settings: draftVoice,
      openAiKeyFallback: draftConfig.apiKeys.openai,
    });
  };

  const handleSaveAll = () => {
    onSaveProviderConfig(draftConfig);
    onSaveVoiceSettings(draftVoice);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Configurar Inteligência Artificial & Voz
              </h2>
              <p className="text-xs text-slate-400">
                Conecte sua chave de API favorita • Salva 100% localmente no seu navegador
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
        <div className="px-6 pt-3 border-b border-slate-800 flex gap-4 bg-slate-950/40">
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'ai'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Provedor de IA (API Key)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('voice')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'voice'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Volume2 className="w-4 h-4" />
            <span>Voz e Leitura Assistida</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {activeTab === 'ai' ? (
            <>
              {/* Provider Selector Grid */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
                  1. Escolha o Provedor de IA
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
                              title="Chave preenchida"
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

              {/* API Key Input */}
              <div className="bg-slate-950/60 border border-slate-800/90 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">
                      Configurar {currentProvider.name}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Insira sua chave de API para habilitar comentários e respostas por voz
                    </p>
                  </div>
                  <a
                    href={currentProvider.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
                  >
                    <span>Obter API Key</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Chave de API ({currentProvider.shortName})
                  </label>
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
                </div>

                {/* Model Selector + Custom Model */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Modelo Recomendado
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
                      className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 focus:outline-none rounded-xl px-3 py-2.5 text-xs text-slate-100"
                    >
                      {currentProvider.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                      <option value="__custom__">Outro modelo (digitar ao lado)...</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      ID do Modelo Ativo
                    </label>
                    <input
                      type="text"
                      value={currentModel}
                      onChange={(e) => handleModelChange(e.target.value)}
                      placeholder={currentProvider.defaultModel}
                      className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 focus:outline-none rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                    />
                  </div>
                </div>

                {/* Base URL (Advanced/Custom) */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Endpoint Base da API (Opcional / Proxy Customizado)
                  </label>
                  <input
                    type="text"
                    value={currentBaseUrl}
                    onChange={(e) => handleBaseUrlChange(e.target.value)}
                    placeholder={currentProvider.defaultBaseUrl}
                    className="w-full bg-slate-900/70 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl px-3 py-2 text-xs text-slate-300 font-mono"
                  />
                </div>

                {/* Test Connection Button & Status */}
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
                        <span>Testando conexão com {currentProvider.shortName}...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Testar Chave de API</span>
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
            </>
          ) : (
            /* Voice & Reading Settings Tab */
            <div className="space-y-5">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Motor de Voz (Text-to-Speech)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setDraftVoice((prev) => ({ ...prev, ttsEngine: 'browser' }))
                      }
                      className={`p-3 rounded-xl border text-left transition-all ${
                        draftVoice.ttsEngine === 'browser'
                          ? 'bg-indigo-600/20 border-indigo-500 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="text-xs font-bold">
                        Voz Nativa do Navegador (Recomendado)
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        100% gratuita, latência zero e compatível com qualquer IA (DeepSeek, Claude, Gemini, Kimi, GLM).
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setDraftVoice((prev) => ({ ...prev, ttsEngine: 'openai_cloud' }))
                      }
                      className={`p-3 rounded-xl border text-left transition-all ${
                        draftVoice.ttsEngine === 'openai_cloud'
                          ? 'bg-indigo-600/20 border-indigo-500 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="text-xs font-bold">OpenAI Cloud TTS (Voz Neural HD)</div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Usa a API de áudio da OpenAI (requer chave da OpenAI preenchida).
                      </p>
                    </button>
                  </div>
                </div>

                {draftVoice.ttsEngine === 'browser' ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Voz do Sistema (Português destacado no topo)
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
                        <option value="">Voz padrão do navegador (pt-BR)</option>
                      )}
                      {availableVoices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Voz OpenAI TTS
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
                        <option value="nova">Nova (Feminina natural e clara)</option>
                        <option value="alloy">Alloy (Versátil e equilibrada)</option>
                        <option value="onyx">Onyx (Masculina grave e firme)</option>
                        <option value="shimmer">Shimmer (Expressiva e suave)</option>
                        <option value="echo">Echo (Calma e didática)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Chave OpenAI para Áudio (se usar outro LLM)
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

                {/* Speed & Pitch sliders */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-300 font-medium">Velocidade da Leitura</span>
                      <span className="text-indigo-400 font-bold">{draftVoice.rate.toFixed(2)}x</span>
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
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Ouvir Amostra de Voz</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Behavior Checkboxes */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
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
                      Retomar leitura do PDF automaticamente após resposta da IA
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      Assim que a IA terminar de responder sua pergunta em voz alta, ela volta a ler o PDF da frase onde parou.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftVoice.proactivePageSummary}
                    onChange={(e) =>
                      setDraftVoice((prev) => ({
                        ...prev,
                        proactivePageSummary: e.target.checked,
                      }))
                    }
                    className="mt-1 rounded accent-indigo-500"
                  />
                  <div>
                    <span className="block text-xs font-semibold text-slate-200">
                      Modo Tutor Proativo ao final de cada página
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      Ao concluir a leitura de uma página, a IA faz um breve comentário resumindo os pontos-chave antes de avançar.
                    </span>
                  </div>
                </label>
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
