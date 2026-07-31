// Build + empacotamento para o Discloud, multiplataforma (Windows/macOS/Linux).
// Uso: npm run build:discloud
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ENTRY = ".output/server/index.mjs";
const OUT_DIR = "dist-discloud";
const cwd = process.cwd();

function fail(msg) {
  console.error(`\n[build:discloud] ERRO: ${msg}\n`);
  process.exit(1);
}

function step(label, fn) {
  try {
    return fn();
  } catch (err) {
    fail(`${label}: ${err?.message ?? err}`);
  }
}

// 1) Build com o preset Node (o "npm run build" normal gera dist/, alvo Cloudflare).
const result = spawnSync("vite", ["build"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NITRO_PRESET: "node-server" },
});

if (result.error) fail(`nao foi possivel executar "vite build": ${result.error.message}`);
if (result.status !== 0) fail(`"vite build" terminou com codigo ${result.status}. Corrija o erro acima antes de montar o zip.`);

const entryPath = resolve(cwd, ENTRY);
if (!existsSync(entryPath) || !statSync(entryPath).isFile()) {
  fail(
    `o build terminou, mas ${ENTRY} nao existe.\n` +
      `Isso normalmente acontece quando NITRO_PRESET nao foi aplicado.\n` +
      `Rode manualmente e verifique a saida:\n` +
      `  NITRO_PRESET=node-server npx vite build        (macOS/Linux)\n` +
      `  $env:NITRO_PRESET="node-server"; npx vite build (Windows PowerShell)`,
  );
}

// 2) Pasta limpa de empacotamento.
const outPath = resolve(cwd, OUT_DIR);
step("nao foi possivel preparar a pasta " + OUT_DIR, () => {
  rmSync(outPath, { recursive: true, force: true });
  mkdirSync(outPath, { recursive: true });
});

// 3) Copia o build e a config.
step("nao foi possivel copiar .output", () =>
  cpSync(resolve(cwd, ".output"), resolve(outPath, ".output"), { recursive: true }),
);

const configPath = resolve(cwd, "discloud.config");
if (!existsSync(configPath)) fail("discloud.config nao encontrado na raiz do projeto.");
step("nao foi possivel copiar discloud.config", () => cpSync(configPath, resolve(outPath, "discloud.config")));

const warnings = [];

// 4) .env (chaves lidas em runtime pelo servidor).
const envPath = resolve(cwd, ".env");
if (existsSync(envPath)) {
  step("nao foi possivel copiar .env", () => cpSync(envPath, resolve(outPath, ".env")));
} else {
  warnings.push(
    "nenhum .env encontrado na raiz: o site vai subir SEM as chaves do Supabase. " +
      "Crie o .env e rode de novo, ou cadastre as variaveis no painel do Discloud.",
  );
}

// 5) package.json de runtime — sem ele o Discloud cai no fallback "serve" e falha
//    com "sh: 1: serve: Permission denied".
step("nao foi possivel gravar o package.json de runtime", () =>
  writeFileSync(
    resolve(outPath, "package.json"),
    JSON.stringify(
      {
        name: "malta",
        private: true,
        type: "module",
        scripts: { start: `node ${ENTRY}` },
        engines: { node: ">=20" },
      },
      null,
      2,
    ) + "\n",
  ),
);

// 6) Validacao final do pacote.
const packagedEntry = resolve(outPath, ENTRY);
if (!existsSync(packagedEntry) || !statSync(packagedEntry).isFile()) {
  fail(`o pacote foi montado, mas ${OUT_DIR}/${ENTRY} nao existe. Nao suba o zip assim.`);
}

for (const w of warnings) console.warn(`\n[build:discloud] AVISO: ${w}`);

console.log(`\n[build:discloud] OK -> pacote pronto em ${OUT_DIR}/`);
console.log("[build:discloud] Conteudo (tudo isso tem que ficar na RAIZ do zip):");
console.log("  .output/server/index.mjs");
console.log("  discloud.config");
console.log("  package.json   (start = node .output/server/index.mjs)");
console.log(existsSync(envPath) ? "  .env" : "  .env  <-- AUSENTE");
console.log(`\n[build:discloud] Linux/macOS: cd ${OUT_DIR} && rm -f ../malta.zip && zip -r ../malta.zip . && cd ..`);
console.log(`[build:discloud] Windows: entre em ${OUT_DIR}, selecione TODOS os itens de dentro (com "Itens ocultos" ativado) e compacte.`);
console.log("[build:discloud] Confira antes de subir: unzip -l malta.zip | head");
