# Deploy no Discloud

## 0. O arquivo `discloud.config`
Para hospedar **site**, o Discloud identifica a aplicação pelo campo `ID`, que é o
**subdomínio** criado no painel (ex.: `ID=malta` → `malta.discloud.app`).

```text
ID=SEU-SUBDOMINIO
TYPE=site
MAIN=.output/server/index.mjs
RAM=512
VERSION=latest
AUTORESTART=true
```

Troque `SEU-SUBDOMINIO` pelo subdomínio real (só a parte antes de `.discloud.app`).

> Erro `Encontramos um erro dentro do arquivo discloud.config` quase sempre é:
> - falta do campo `ID` (ou uso de `NAME` no lugar dele em `TYPE=site`);
> - chave declarada com valor vazio (`AVATAR=`, `APT=`) — omita a linha em vez de deixar vazia;
> - espaços em volta do `=`, acentos, ou arquivo salvo com BOM / final de linha CRLF.
>
> Salve sempre em UTF-8 sem BOM, uma chave por linha, sem espaços.

> Erro `O arquivo principal .output/server/index.mjs não foi encontrado dentro do zip`
> significa uma de três coisas: (a) você rodou `npm run build` em vez de
> `npm run build:discloud` (o build normal sai em `dist/`, não em `.output/`);
> (b) o zip tem uma subpasta na raiz; (c) o compactador pulou a pasta `.output`
> por ela começar com ponto e estar no `.gitignore`. Siga os passos abaixo.

## 1. Build local (na sua máquina, não na Lovable)
```bash
npm install
npm run build:discloud
```
O script `build:discloud` funciona igual em Windows, macOS e Linux: ele define
`NITRO_PRESET=node-server`, roda o `vite build` e **falha com mensagem clara** se
`.output/server/index.mjs` não tiver sido gerado. Se ele terminar com
`[build:discloud] OK`, o entry existe de verdade.

Nunca use `npm run build` para o Discloud — esse gera `dist/` (alvo Cloudflare) e o
`MAIN` do `discloud.config` não vai existir.

Conferência manual, se quiser:
```bash
ls .output/server/index.mjs
```
No Windows: `dir .output\server\index.mjs`. Se não existir, NÃO monte o zip.

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

Confira o conteúdo do zip **antes** de subir:
```bash
unzip -l malta.zip | head
```
Tem que aparecer `.output/server/index.mjs` — sem nenhum prefixo de pasta na frente.
No Windows, abra o zip com duplo clique: você deve ver `discloud.config`, `.env` e
`.output` já no primeiro nível.

Comando pronto (Linux/macOS, de dentro da pasta do projeto):
```bash
rm -f malta.zip
zip -r malta.zip .output discloud.config .env
```
No Windows: selecione os 3 itens **dentro** da pasta do projeto, clique com o botão
direito → "Compactar". Nunca compacte a pasta do projeto inteira.

Atenção: `.output` e `.env` começam com ponto. No Windows ative
"Exibir → Itens ocultos" no Explorer, senão você zipa sem eles e o erro volta.

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
- [ ] `npm run build:discloud` terminou com `[build:discloud] OK`
- [ ] `.output/server/index.mjs` existe
- [ ] `discloud.config` tem `MAIN=.output/server/index.mjs`
- [ ] `discloud.config` tem `ID=` com o seu subdomínio real (não o placeholder)
- [ ] zip com `discloud.config`, `.env` e `.output/` na raiz (sem subpasta)
- [ ] `unzip -l malta.zip` mostra `.output/server/index.mjs` sem prefixo
