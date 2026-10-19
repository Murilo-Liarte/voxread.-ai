import React from 'react';
import {
  X,
  Brain,
  Ear,
  Target,
  Zap,
  Sparkles,
  TrendingUp,
  Clock,
  CheckCircle2,
  Award,
} from 'lucide-react';
import type { StudyStats } from '../types';

interface NeuroscienceModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: StudyStats;
}

function formatStudyTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins === 0) return `${secs}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours === 0) return `${mins}m ${secs}s`;
  return `${hours}h ${remMins}m`;
}

export const NeuroscienceModal: React.FC<NeuroscienceModalProps> = ({
  isOpen,
  onClose,
  stats,
}) => {
  if (!isOpen) return null;

  const estimatedRetentionBoost = Math.min(
    48,
    40 + Math.floor(stats.flashcardsReviewedCount * 0.8)
  );

  const pillars = [
    {
      icon: Ear,
      badge: '+40% de Retenção Neural',
      color: 'from-indigo-500/20 to-blue-500/10 border-indigo-500/30 text-indigo-300',
      title: '1. Sincronização Auditivo-Visual (Dupla Codificação de Paivio)',
      concept:
        'O cérebro humano possui dois canais independentes na memória de trabalho: a alça fonológica (audição) e a agenda visuoespacial (visão).',
      benefit:
        'Ao ver a frase/palavra destacada pelo cursor inteligente e ouvi-la simultaneamente com entonação de professor, você ativa duas vias neurais paralelas, elevando a retenção em até 40% sem exigir esforço extra.',
    },
    {
      icon: Target,
      badge: 'Flow State Contínuo',
      color: 'from-violet-500/20 to-purple-500/10 border-violet-500/30 text-violet-300',
      title: '2. Eliminação da Leitura Superficial (Mind-Wandering)',
      concept:
        'Na leitura silenciosa tradicional de apostilas longas, os olhos frequentemente passam pelo papel enquanto a mente divaga em outros pensamentos.',
      benefit:
        'O highlighter automático sincronizado à voz atua como um metrônomo cognitivo, puxando sua atenção visual e auditiva no mesmo ritmo e mantendo seu cérebro em estado de fluxo (Flow State).',
    },
    {
      icon: Brain,
      badge: 'Combate à Curva de Ebbinghaus',
      color: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-300',
      title: '3. Efeito do Teste e Repetição Ativa (Active Recall)',
      concept:
        'Segundo a Curva do Esquecimento de Ebbinghaus, esquecemos até 75% do que apenas lemos passivamente em 48 horas.',
      benefit:
        'As pausas estratégicas ao final de cada tópico com Flashcards obrigam o cérebro a fazer o esforço ativo de resgate (retrieval practice), consolidando a informação no córtex pré-frontal para o dia da prova.',
    },
    {
      icon: Zap,
      badge: 'Zero Fadiga de Decisão',
      color: 'from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-300',
      title: '4. Redução da Carga Cognitiva Extrínseca',
      concept:
        'Rolar páginas manualmente, procurar onde parou na folha e filtrar cabeçalhos repetitivos de apostilas consome energia preciosa do córtex.',
      benefit:
        'Com Auto-Scroll, higienização automática de cabeçalhos/rodapés (Estratégia/Gran) e Modo Professor por comando de voz, 100% da sua energia mental fica livre para compreender a matéria.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="px-5 sm:px-7 py-4 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-indigo-950/60 via-slate-900 to-violet-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white">
                  A Neurociência por trás do Método
                </h2>
                <span className="hidden sm:inline-block text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
                  Alta Performance em Concursos
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Por que estudar apostilas com Leitura Sincronizada + Active Recall multiplica sua aprovação
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 sm:p-7 overflow-y-auto space-y-6 flex-1">
          {/* Student Live Telemetry & Retention Boost Dashboard */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4" />
                <span>Seu Painel de Performance Neurocognitiva</span>
              </span>
              <span className="text-[11px] text-emerald-400 font-semibold">
                Estudo Ativo Monitorado
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-900/90 border border-slate-800/90 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Leitura Ativa</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-white">
                  {formatStudyTime(stats.activeReadingSeconds)}
                </p>
              </div>

              <div className="bg-slate-900/90 border border-slate-800/90 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Frases Sincronizadas</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-white">
                  {stats.sentencesReadCount}
                </p>
              </div>

              <div className="bg-slate-900/90 border border-slate-800/90 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Flashcards Resgatados</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-white">
                  {stats.flashcardsReviewedCount}
                </p>
              </div>

              <div className="bg-gradient-to-br from-emerald-950/80 to-teal-950/50 border border-emerald-500/40 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-emerald-300 text-[11px] mb-1">
                  <Award className="w-3.5 h-3.5" />
                  <span>Ganho de Retenção Est.</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-emerald-300">
                  +{estimatedRetentionBoost}%
                </p>
              </div>
            </div>

            {/* Visual Retention Comparison Bar Infographic */}
            <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-2.5">
              <div className="text-xs font-semibold text-slate-300">
                Comparativo de Retenção na Memória de Longo Prazo (após 7 dias):
              </div>
              <div className="space-y-1.5">
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>Leitura Silenciosa Passiva (Tradicional)</span>
                    <span>~20% retido</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-slate-500 w-[20%]" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-emerald-300 font-semibold mb-1">
                    <span>Dupla Codificação (Voz + Cursor BBox) + Active Recall (VoxRead AI)</span>
                    <span>Até 85% retido</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-400 w-[85%]" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Pillars Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pillars.map((p) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.title}
                  className={`rounded-2xl border bg-gradient-to-br p-5 flex flex-col justify-between gap-3 ${p.color}`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="w-9 h-9 rounded-xl bg-slate-950/60 border border-white/10 flex items-center justify-center">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-950/60 border border-white/10">
                        {p.badge}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-white leading-snug">
                      {p.title}
                    </h3>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      <strong className="text-white">O Conceito:</strong> {p.concept}
                    </p>
                  </div>

                  <div className="pt-2.5 border-t border-white/10 text-xs text-slate-200 leading-relaxed">
                    <strong className="text-emerald-300">Benefício na Prova:</strong>{' '}
                    {p.benefit}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <span className="text-xs text-slate-400 hidden sm:inline">
            Dica: Pressione a tecla <strong className="text-slate-200">Espaço</strong> a qualquer momento para acionar o Modo Professor.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/25 transition-all"
          >
            Continuar Estudo de Alta Retenção
          </button>
        </div>
      </div>
    </div>
  );
};
