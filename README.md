# VoxRead AI — Leitura Assistida de PDF por Voz com IA 🎙️📖

Uma aplicação web moderna, intuitiva e acessível para **Leitura Assistida de PDFs por Voz** potencializada por Inteligência Artificial. Conecte sua chave de API favorita e acompanhe a leitura em voz alta sincronizada frase a frase, com capacidade de **interrupção instantânea ("barge-in")** por voz ou texto para tirar dúvidas, debater ideias ou pedir explicações contextuais.

![VoxRead AI Preview](https://raw.githubusercontent.com/antigravity/assets/main/voxread-banner.png)

---

## ✨ Principais Funcionalidades

- **Conectividade Multi-IA Flexível**:
  - Suporte nativo para **Google Gemini**, **OpenAI (ChatGPT)**, **Anthropic Claude**, **DeepSeek**, **Moonshot Kimi**, **Zhipu GLM** e provedores customizados via **OpenRouter**.
  - As chaves de API ficam salvas **100% no navegador local** (`localStorage`), garantindo sua total privacidade.
- **Sincronização Frase a Frase (Estilo Karaokê)**:
  - Cada frase do PDF é segmentada e destacada visualmente em tempo real enquanto a voz sintetizada lê.
  - Clique em qualquer frase da tela para pular a leitura diretamente para aquele ponto.
- **Interrupção Instantânea ("Barge-in") por Voz e Texto**:
  - A qualquer momento, clique no botão **"Interromper / Falar com IA"** ou envie uma pergunta no chat lateral.
  - A leitura pausa imediatamente, a IA analisa o trecho e a página atual, responde em voz alta e, em seguida, retoma a leitura de onde parou.
- **3 Modos de Visualização Alternáveis**:
  - **Modo Dividido (Split View)**: PDF original renderizado em alta nitidez lado a lado com o modo leitor.
  - **Modo Leitor Focado**: Layout de leitura limpo com tipografia confortável para estudos prolongados.
  - **PDF Original**: Visualização em tela cheia do documento com zoom e paginação rápida.
- **Motor Híbrido de Síntese de Voz (TTS)**:
  - Voz nativa do navegador via **Web Speech API** (gratuita, sem custo adicional de tokens e latência zero).
  - Suporte opcional a vozes neurais da OpenAI (`tts-1`).
- **Persistência Offline**:
  - Documentos e progresso de leitura salvos localmente no `IndexedDB`.

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- [Node.js](https://nodejs.org/) versão 18 ou superior
- NPM ou Yarn

### Passo a Passo

1. Clone o repositório:
```bash
git clone <URL_DO_SEU_REPOSITORIO>
cd leitura-assistida-ia
```

2. Instale as dependências:
```bash
npm install
```

3. Inicie o servidor de desenvolvimento:
```bash
npm run dev
```

4. Acesse no navegador:
```
http://localhost:5173/
```

5. Clique em **"Conectar IA"** na barra superior para informar sua chave de API (Gemini, ChatGPT, Claude, DeepSeek, Kimi ou GLM) e comece a ler!

---

## 🧪 Testes Automatizados

O projeto inclui suíte de testes com **Vitest** cobrindo a segmentação de frases de PDF e os adaptadores de payload dos provedores de IA:

```bash
npm run test
```

Para gerar a build de produção otimizada:

```bash
npm run build
```

---

## 🌐 Publicação no GitHub Pages

O repositório já inclui um fluxo de trabalho do **GitHub Actions** em `.github/workflows/deploy.yml`.

Para publicar:
1. No seu repositório no GitHub, vá em **Settings** > **Pages**.
2. Na seção **Build and deployment** > **Source**, selecione **GitHub Actions**.
3. A cada commit ou push para a branch `main`, a compilação e deploy serão executados automaticamente!

---

## 📄 Licença

Distribuído sob a licença MIT. Sinta-se livre para usar, modificar e distribuir.
