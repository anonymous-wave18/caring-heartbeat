# Deploy no Discloud

## 0. O arquivo `discloud.config`
Para hospedar **site**, o Discloud identifica a aplicação pelo campo `ID`, que é o
**subdomínio** criado no painel (ex.: `ID=malta` → `malta.discloud.app`).

```text
ID=SEU-SUBDOMINIO
TYPE=site
MAIN=server.mjs
RAM=512
VERSION=latest
AUTORESTART=true
```

Troque `SEU-SUBDOMINIO` pelo subdomínio real (só a parte antes de `.discloud.app`) —
o build aborta se o placeholder continuar aí. Salve em UTF-8 sem BOM, uma chave por
linha, sem espaços em volta do `=` e **sem chaves vazias** (`AVATAR=`, `APT=` → omita).

`MAIN=server.mjs` é o ponto central da correção do `serve: Permission denied`: o
arquivo de start fica na **raiz** do zip (nome comum, sem ponto), então o Discloud
executa `node server.mjs` em vez de tentar o fallback estático `serve`.

## 1. Build + empacotamento (na sua máquina, não na Lovable)
```bash
npm install
npm run build:discloud
```

O script faz tudo:
- força `NITRO_PRESET=node-server` e roda o build;
- valida que o servidor foi gerado (aborta com mensagem clara se não);
- valida o `discloud.config` (`ID` real + `MAIN=server.mjs`);
- monta `dist-discloud/` com `output/`, `server.mjs`, `package.json`
  (`start = node server.mjs`), `discloud.config` e `.env`;
- **sobe o servidor localmente** e confirma que ele responde HTTP;
- gera o **`malta-discloud.zip`** já pronto para upload.

Nunca use `npm run build` para o Discloud — esse gera `dist/` (alvo Cloudflare).

## 2. Suba o zip
Envie o `malta-discloud.zip` gerado na raiz do projeto. Não precisa compactar nada
à mão. Se quiser conferir:

```bash
unzip -l malta-discloud.zip | head
```

Estrutura correta (nada dentro de subpasta):
```text
malta-discloud.zip
├── server.mjs
├── package.json
├── discloud.config
├── .env
└── output/
    └── server/
        └── index.mjs
```

No log do Discloud, o start certo aparece como `node server.mjs` (ou o boot do
Nitro). Se aparecer `serve`, o zip enviado é antigo — rode o build de novo.

## 3. Erros comuns e a causa real

**`sh: 1: serve: Permission denied`**
- o zip não tinha um start explícito na raiz. Agora `MAIN=server.mjs` +
  `package.json` com `start` resolvem isso; garanta que subiu o zip novo.

**`O arquivo principal ... não foi encontrado dentro do zip`**
- rodou `npm run build` em vez de `npm run build:discloud`; ou
- o zip tem subpasta na raiz (`malta/server.mjs` em vez de `server.mjs`).

**`Encontramos um erro dentro do arquivo discloud.config`**
- falta o `ID`, chave com valor vazio, espaços em volta do `=`, acentos, BOM ou CRLF.

## 4. Variáveis de ambiente
Nada precisa ser cadastrado à mão no painel: o `.env` incluído no zip é lido como
variáveis de ambiente. Ele contém:
- VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_PROJECT_ID
- SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_PROJECT_ID
- SB_SERVICE_ROLE_KEY (somente servidor)

As `VITE_*` são embutidas no build (passo 1), então precisam existir **na hora do
build**. As demais são lidas em runtime, no servidor — nunca vão para o bundle do front.

## 5. Porta
O servidor Node do Nitro usa `PORT` (padrão 3000). O Discloud define isso
automaticamente para `TYPE=site`.

## 6. Checklist antes de subir
- [ ] `npm run build:discloud` terminou com `[build:discloud] OK`
- [ ] apareceu `start testado localmente: node server.mjs respondeu HTTP`
- [ ] nenhum `AVISO: nenhum .env encontrado`
- [ ] `discloud.config` tem `ID=` com o subdomínio real (não o placeholder)
- [ ] subiu o `malta-discloud.zip` gerado agora (não um zip antigo)
