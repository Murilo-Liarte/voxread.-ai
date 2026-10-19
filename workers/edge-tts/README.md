# VoxRead AI — Cloudflare Worker para Microsoft Edge Neural TTS (`pt-BR-FranciscaNeural` / `Thalita` / `Antonio`)

Por que este Worker existe?
Quando o **VoxRead AI** está hospedado no **GitHub Pages** (`https://murilo-liarte.github.io/voxread.-ai/`), o navegador bloqueia conexões WebSocket diretas para `speech.platform.bing.com` devido à validação do cabeçalho `Origin` e do token `Sec-MS-GEC` exigido pela Microsoft.

Enquanto os motores **Piper Neural WASM** e **Kokoro-82M Neural** rodam 100% dentro do próprio navegador sem nenhum servidor, o **Edge Neural Studio** pode ser habilitado gratuitamente na nuvem publicando este Cloudflare Worker (plano gratuito da Cloudflare: até 100.000 requisições/dia).

## Como publicar em 1 minuto

1. No terminal, entre na pasta do Worker:
   ```bash
   cd workers/edge-tts
   ```
2. Publique na sua conta gratuita da Cloudflare:
   ```bash
   npx wrangler deploy
   ```
3. Copie a URL gerada (ex.: `https://voxread-edge-tts-proxy.<seu-subdominio>.workers.dev`) e cole no campo **"URL do Cloudflare Worker (Proxy Edge Neural)"** dentro das configurações de voz do VoxRead AI.
