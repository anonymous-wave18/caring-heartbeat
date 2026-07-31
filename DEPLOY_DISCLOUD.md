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
Salve em UTF-8 sem BOM, uma chave por linha, sem espaços em volta do `=` e **sem
chaves vazias** (`AVATAR=`, `APT=` → omita a linha).

## 1. Build + empacotamento (na sua máquina, não na Lovable)
```bash
npm install
npm run build:discloud
```

O script:
- força `NITRO_PRESET=node-server` e roda o `vite build`;
- valida que `.output/server/index.mjs` foi gerado (aborta com mensagem clara se não);
- monta a pasta **`dist-discloud/`** já com tudo que o Discloud precisa:
  `.output/`, `discloud.config`, `.env` e um `package.json` de runtime
  (`start = node .output/server/index.mjs`).

Nunca use `npm run build` para o Discloud — esse gera `dist/` (alvo Cloudflare) e o
`MAIN` do `discloud.config` não vai existir.

## 2. Monte o .zip
Zipe **o conteúdo de dentro** de `dist-discloud/`, nunca a pasta em si.

```bash
cd dist-discloud && rm -f ../malta.zip && zip -r ../malta.zip . && cd ..
unzip -l malta.zip | head
```

No Windows: entre em `dist-discloud`, ative **Exibir → Itens ocultos** (para pegar
`.output` e `.env`), selecione todos os itens e compacte.

Estrutura correta:
```text
malta.zip
├── discloud.config
├── package.json
├── .env
└── .output/
    └── server/
        └── index.mjs
```

## 3. Erros comuns e a causa real

**`O arquivo principal .output/server/index.mjs não foi encontrado dentro do zip`**
- rodou `npm run build` em vez de `npm run build:discloud`; ou
- o zip tem uma subpasta na raiz (`malta/discloud.config` em vez de `discloud.config`); ou
- o compactador pulou `.output`/`.env` por serem itens ocultos.

**`sh: 1: serve: Permission denied`**
- faltava `package.json` no zip. Sem o script `start`, o Discloud cai no fallback
  estático `serve`, que não existe no container. O `build:discloud` já grava esse
  `package.json` dentro de `dist-discloud/` — basta zipar a pasta inteira.

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
- [ ] nenhum `AVISO: nenhum .env encontrado`
- [ ] `discloud.config` tem `ID=` com o subdomínio real (não o placeholder)
- [ ] zip feito de **dentro** de `dist-discloud/`
- [ ] `unzip -l malta.zip | head` mostra `discloud.config`, `package.json`, `.env` e
      `.output/server/index.mjs` sem prefixo de pasta
