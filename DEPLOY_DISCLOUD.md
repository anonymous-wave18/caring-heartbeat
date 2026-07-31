# Deploy no Discloud

## 1. Build local (na sua máquina)
```bash
NITRO_PRESET=node-server npm run build
```
Isso gera a pasta `.output/` com o servidor Node (`.output/server/index.mjs`).

## 2. Monte o .zip para upload
Inclua APENAS:
- `.output/`  (build pronto)
- `discloud.config`
- `.env`  (com as chaves — o Discloud lê como variáveis de ambiente)

NÃO envie: `node_modules`, `src`, `.git`.

## 3. Variáveis de ambiente
O `.env` já contém:
- VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_PROJECT_ID
- SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_PROJECT_ID
- SB_SERVICE_ROLE_KEY (somente servidor)

As VITE_* são embutidas no build (passo 1), então precisam estar presentes na hora do build.

## 4. Porta
O servidor Node do Nitro usa `PORT` (padrão 3000). O Discloud define isso automaticamente para TYPE=site.
