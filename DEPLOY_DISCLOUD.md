# Deploy no Discloud

> Erro `O arquivo principal .output/server/index.mjs não foi encontrado dentro do zip`
> significa uma de duas coisas: (a) você zipou o projeto sem rodar o build, ou
> (b) o zip tem uma subpasta na raiz. Siga os passos abaixo exatamente.

## 1. Build local (na sua máquina, não na Lovable)
```bash
npm install
npm run build:discloud
```
Isso gera `.output/` com o servidor Node. Confira que o arquivo existe:
```bash
ls .output/server/index.mjs
```
Se esse `ls` falhar, NÃO monte o zip — o build não terminou.

No Windows (PowerShell), se `build:discloud` não pegar a variável:
```powershell
$env:NITRO_PRESET="node-server"; npx vite build
```

## 2. Monte o .zip para upload
Inclua APENAS:
- `.output/`  (build pronto)
- `discloud.config`
- `.env`  (com as chaves — o Discloud lê como variáveis de ambiente)

NÃO envie: `node_modules`, `src`, `.git`, `dist`.

**A estrutura interna do zip precisa ter esses itens na RAIZ**, assim:
```text
malta.zip
├── discloud.config
├── .env
└── .output/
    └── server/
        └── index.mjs
```
Se abrir o zip e aparecer `malta/discloud.config`, o Discloud não acha o MAIN. Esse é
o motivo mais comum do erro.

Comando pronto (Linux/macOS, de dentro da pasta do projeto):
```bash
rm -f malta.zip
zip -r malta.zip .output discloud.config .env
```
No Windows: selecione os 3 itens **dentro** da pasta do projeto, clique com o botão
direito → "Compactar". Nunca compacte a pasta do projeto inteira.

## 3. Variáveis de ambiente
O `.env` já contém:
- VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_PROJECT_ID
- SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_PROJECT_ID
- SB_SERVICE_ROLE_KEY (somente servidor)

As VITE_* são embutidas no build (passo 1), então precisam estar presentes na hora do
build — se você rodar o build sem `.env`, o site sobe sem conexão com o banco.

## 4. Porta
O servidor Node do Nitro usa `PORT` (padrão 3000). O Discloud define isso automaticamente para TYPE=site.

## 5. Checklist antes de subir
- [ ] `npm run build:discloud` terminou sem erro
- [ ] `.output/server/index.mjs` existe
- [ ] `discloud.config` tem `MAIN=.output/server/index.mjs`
- [ ] zip com `discloud.config`, `.env` e `.output/` na raiz (sem subpasta)
