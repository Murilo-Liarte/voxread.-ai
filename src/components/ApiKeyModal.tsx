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
  Radio,
} from 'lucide-react';
import { PROVIDERS_CATALOG, testProviderConnection } from '../services/llmService';
import { EDGE_NEURAL_VOICES, getEdgeVoiceMeta } from '../services/edgeTtsClient';
import { speechService } from '../services/speechService';
import type {
  EdgeNeuralVoiceId,
  LLMProviderId,
  ProviderConfig,
  VoiceSettings,
} from '../types';

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
  const [activeTab, setActiveTab] = useState<'voice' | 'ai'>('voice');
  const [showKey, setShowKey] = useState(false);
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [testState, setTestState] = useState<{
    loading: boolean;
    ok?: boolean;
    message?: string;
  }>({ loading: false });

  useEffect(() => {
    setDraftConfig(providerConfig);
    setDraftVoice(voiceSettings);
    setTestState({ loading: false });
    setIsTestingVoice(false);
  }, [providerConfig, voiceSettings, isOpen]);

  if (!isOpen) return null;

  const currentProvider = PROVIDERS_CATALOG[draftConfig.providerId];
  const currentApiKey = draftConfig.apiKeys[draftConfig.providerId] || '';
  const currentModel =
    draftConfig.selectedModels[draftConfig.providerId] || currentProvider.defaultModel;
  const currentBaseUrl =
    draftConfig.customBaseUrls[draftConfig.providerId] || currentProvider.defaultBaseUrl;

  const selectedEdgeVoice = getEdgeVoiceMeta(
    draftVoice.edgeVoiceId || 'pt-BR-FranciscaNeural'
  );

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
    setIsTestingVoice(true);
    speechService.speak({
      text: `Olá! Eu sou a voz ${selectedEdgeVoice.shortName} via Microsoft Edge TTS. Atenção para esta dica de prova: na Administração Pública, o gestor só pode agir quando a lei autoriza!`,
      blockType: 'alert',
      settings: draftVoice,
      onEnd: () => setIsTestingVoice(false),
      onError: () => setIsTestingVoice(false),
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
                Vozes Neurais Edge TTS & Inteligência Artificial
              </h2>
              <p className="text-xs text-slate-400">
                Todas as vozes powered by <code className="text-indigo-300">msedge-tts</code> /{' '}
                <code className="text-indigo-300">edge-tts</code> com sincronia palavra por palavra
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
            <span>1. Vozes Neurais (msedge-tts / edge-tts)</span>
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
            <span>2. Chave de API (Professor IA & Flashcards)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'voice' ? (
            <div className="space-y-5">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-4">
                {/* Protocol Selector: msedge-tts vs edge-tts */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5" />
                      <span>Motor Neural Microsoft Edge (100% Gratuito)</span>
                    </label>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
                      WordBoundary Sync Ativo
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setDraftVoice((prev) => ({ ...prev, ttsEngine: 'msedge_tts' }))
                      }
                      className={`p-3 rounded-xl border text-left transition-all ${
                        draftVoice.ttsEngine === 'msedge_tts'
                          ? 'bg-indigo-600/20 border-indigo-500 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold font-mono">msedge-tts</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold">
                          Padrão
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Stream neural 24kHz MP3 com marcação exata de tempo por palavra e prosódia SSML.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setDraftVoice((prev) => ({ ...prev, ttsEngine: 'edge_tts' }))
                      }
                      className={`p-3 rounded-xl border text-left transition-all ${
                        draftVoice.ttsEngine === 'edge_tts'
                          ? 'bg-indigo-600/20 border-indigo-500 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold font-mono">edge-tts</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                          ReadAloud HD
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Protocolo Universal Edge ReadAloud com legendas sincronizadas em tempo real.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Quick Pick Cards for Top 4 Voices */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">
                    Vozes Neurais em Destaque (Português do Brasil)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {EDGE_NEURAL_VOICES.slice(0, 4).map((v) => {
                      const isSelected = draftVoice.edgeVoiceId === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() =>
                            setDraftVoice((prev) => ({ ...prev, edgeVoiceId: v.id }))
                          }
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            isSelected
                              ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                              : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold">{v.shortName}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 font-medium">
                              {v.styleTag}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                            {v.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Full 14-Voice Catalog Dropdown */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Catálogo Completo de Vozes Microsoft Edge TTS ({EDGE_NEURAL_VOICES.length}{' '}
                    vozes neurais pt-BR)
                  </label>
                  <select
                    value={draftVoice.edgeVoiceId || 'pt-BR-FranciscaNeural'}
                    onChange={(e) =>
                      setDraftVoice((prev) => ({
                        ...prev,
                        edgeVoiceId: e.target.value as EdgeNeuralVoiceId,
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100"
                  >
                    {EDGE_NEURAL_VOICES.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.label} — [{voice.id}]
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    🎙️ <strong className="text-slate-200">{selectedEdgeVoice.shortName}:</strong>{' '}
                    {selectedEdgeVoice.description}
                  </p>
                </div>

                {/* Speed, Pitch & Test Sample */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-300 font-medium">Velocidade</span>
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

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-300 font-medium">Tom (Pitch SSML)</span>
                      <span className="text-indigo-400 font-bold">
                        {draftVoice.pitch.toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.85"
                      max="1.15"
                      step="0.02"
                      value={draftVoice.pitch}
                      onChange={(e) =>
                        setDraftVoice((prev) => ({
                          ...prev,
                          pitch: parseFloat(e.target.value),
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
                      {isTestingVoice ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                          <span>Falando...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Testar Voz Edge</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Study Method Checkboxes */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftVoice.expressiveProsody !== false}
                    onChange={(e) =>
                      setDraftVoice((prev) => ({
                        ...prev,
                        expressiveProsody: e.target.checked,
                      }))
                    }
                    className="mt-1 rounded accent-indigo-500"
                  />
                  <div>
                    <span className="block text-xs font-semibold text-slate-200">
                      Prosódia Expressiva Automática (SSML Edge TTS)
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      Ajusta automaticamente a ênfase e cadência da voz neural ao ler alertas de prova, títulos de capítulo e perguntas.
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
                      Ao concluir um tópico da apostila, pausa a leitura e lança perguntas de fixação na aba lateral.
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
