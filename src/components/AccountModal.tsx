import React, { useEffect, useState } from 'react';
import {
  User,
  Lock,
  CheckCircle2,
  KeyRound,
  LogOut,
  Sparkles,
  ShieldCheck,
  X,
  ExternalLink,
  BookOpen,
} from 'lucide-react';
import {
  loginAccount,
  logoutActiveAccount,
  registerAccount,
} from '../services/authService';
import { PROVIDERS_CATALOG } from '../services/llmService';
import type {
  PdfLibraryItemSummary,
  ProviderConfig,
  UserAccount,
  VoiceSettings,
} from '../types';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeAccount: UserAccount | null;
  providerConfig: ProviderConfig;
  voiceSettings: VoiceSettings;
  pdfLibrary: PdfLibraryItemSummary[];
  onAccountSuccess: (account: UserAccount) => void;
  onAccountLogout: () => void;
  onOpenPdfLibrary: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  activeAccount,
  providerConfig,
  voiceSettings,
  pdfLibrary,
  onAccountSuccess,
  onAccountLogout,
  onOpenPdfLibrary,
}) => {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState(
    providerConfig.apiKeys.gemini || ''
  );
  const [geminiModel, setGeminiModel] = useState(
    providerConfig.selectedModels.gemini || 'gemini-3.5-flash-lite'
  );
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setGeminiApiKey(providerConfig.apiKeys.gemini || '');
      setGeminiModel(
        providerConfig.selectedModels.gemini || 'gemini-3.5-flash-lite'
      );
    }
  }, [isOpen, providerConfig]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      let acc: UserAccount;
      if (mode === 'register') {
        acc = await registerAccount({
          username,
          password,
          geminiApiKey,
          geminiModel,
          voiceSettings,
          rememberMe,
        });
      } else {
        acc = await loginAccount({
          username,
          password,
          rememberMe,
        });
      }

      onAccountSuccess(acc);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao acessar a conta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logoutActiveAccount();
    onAccountLogout();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                {activeAccount
                  ? `Conta Conectada: @${activeAccount.username}`
                  : 'Sua Conta VoxRead AI'}
              </h2>
              <p className="text-xs text-slate-400">
                Salve configurações de primeira e sua lista de PDFs com login automático
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

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {activeAccount ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-emerald-200">
                    Sessão Permanente Ativa (@{activeAccount.username})
                  </p>
                  <p className="text-[11px] text-emerald-300/80 leading-relaxed">
                    Você não precisa fazer login novamente ao abrir o site. Suas configurações de voz, chave do Google AI Studio e lista de PDFs são salvas automaticamente na sua conta.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Modelo Google AI Studio
                  </span>
                  <span className="text-xs font-bold text-indigo-300 mt-0.5 block truncate">
                    {activeAccount.geminiModel || 'gemini-3.5-flash-lite'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    PDFs na Sua Lista
                  </span>
                  <span className="text-xs font-bold text-emerald-300 mt-0.5 block">
                    {pdfLibrary.length} {pdfLibrary.length === 1 ? 'apostila' : 'apostilas'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPdfLibrary();
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <BookOpen className="w-4 h-4" />
                <span>Abrir Minha Lista de PDFs em Leitura ({pdfLibrary.length})</span>
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-500/40 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Trocar de Usuário / Sair desta Conta</span>
              </button>
            </div>
          ) : (
            <>
              {/* Mode Switcher */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setErrorMsg(null);
                  }}
                  className={`py-2 rounded-lg text-xs font-bold transition-all ${
                    mode === 'register'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Criar Conta Rápida
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg(null);
                  }}
                  className={`py-2 rounded-lg text-xs font-bold transition-all ${
                    mode === 'login'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Já Tenho Conta
                </button>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200">
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nome de Usuário
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="ex: murilo"
                      className="w-full bg-slate-950 border border-slate-700/80 focus:border-indigo-500 focus:outline-none rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-slate-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Senha
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      autoComplete={
                        mode === 'register' ? 'new-password' : 'current-password'
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Sua senha de acesso"
                      className="w-full bg-slate-950 border border-slate-700/80 focus:border-indigo-500 focus:outline-none rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-slate-100"
                    />
                  </div>
                </div>

                {mode === 'register' && (
                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-indigo-300 flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                        Configurar Google AI Studio de Primeira (Opcional)
                      </span>
                      <a
                        href={PROVIDERS_CATALOG.gemini.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
                      >
                        <span>Pegar Key Grátis</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>

                    <input
                      type="password"
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                      placeholder="AIzaSy... (Chave gratuita do Google AI Studio)"
                      className="w-full bg-slate-900 border border-slate-700/80 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs text-slate-100 font-mono"
                    />

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Modelo Gratuito Padrão
                      </label>
                      <select
                        value={geminiModel}
                        onChange={(e) => setGeminiModel(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                      >
                        {PROVIDERS_CATALOG.gemini.models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-2.5 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded accent-indigo-500"
                  />
                  <span className="text-xs text-slate-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    Manter conectado automaticamente (não pedir login ao abrir o site)
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {mode === 'register'
                      ? 'Criar Conta e Salvar Configurações'
                      : 'Entrar e Restaurar Meus PDFs'}
                  </span>
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
