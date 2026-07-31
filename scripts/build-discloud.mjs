// Build + empacotamento para o Discloud, multiplataforma (Windows/macOS/Linux).
// Uso: npm run build:discloud
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BUILD_ENTRY = ".output/server/index.mjs";
// No pacote o build vai para "output/" (sem ponto) e o start é um arquivo na raiz:
// assim o Discloud nunca precisa adivinhar o comando (evita o fallback "serve")
// e nenhum arquivo essencial fica oculto no zip.
const PKG_ENTRY = "output/server/index.mjs";
const START_FILE = "server.mjs";
const OUT_DIR = "dist-discloud";
const ZIP_NAME = "malta-discloud.zip";
const cwd = process.cwd();

// Sobe o server igual o Discloud faria e confere que ele responde HTTP.
const SMOKE_SCRIPT = `
const port = process.env.PORT;
await import("./server.mjs");
const deadline = Date.now() + 20000;
let lastErr;
while (Date.now() < deadline) {
  try {
    const res = await fetch("http://127.0.0.1:" + port + "/");
    if (res.status > 0) { console.log("smoke ok", res.status); process.exit(0); }
  } catch (err) { lastErr = err; }
  await new Promise((r) => setTimeout(r, 500));
}
console.error("servidor nao respondeu na porta " + port + ": " + (lastErr?.message ?? "timeout"));
process.exit(1);
`;

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

const entryPath = resolve(cwd, BUILD_ENTRY);
if (!existsSync(entryPath) || !statSync(entryPath).isFile()) {
  fail(
    `o build terminou, mas ${BUILD_ENTRY} nao existe.\n` +
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

// 3) Copia o build para "output/" (sem ponto) e valida a config.
step("nao foi possivel copiar o build", () =>
  cpSync(resolve(cwd, ".output"), resolve(outPath, "output"), { recursive: true }),
);

const configPath = resolve(cwd, "discloud.config");
if (!existsSync(configPath)) fail("discloud.config nao encontrado na raiz do projeto.");

const configText = readFileSync(configPath, "utf8");
const configId = /^ID=(.*)$/m.exec(configText)?.[1]?.trim();
if (!configId) fail("discloud.config precisa da linha ID=<seu-subdominio>.");
if (configId === "SEU-SUBDOMINIO") {
  fail("troque ID=SEU-SUBDOMINIO no discloud.config pelo subdominio real criado no painel do Discloud.");
}

const configMain = /^MAIN=(.*)$/m.exec(configText)?.[1]?.trim();
if (configMain !== START_FILE) {
  fail(`discloud.config deve ter MAIN=${START_FILE} (encontrado: ${configMain ?? "ausente"}).`);
}

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

// 5) Arquivo de start explicito na raiz (MAIN do discloud.config aponta pra ele).
step(`nao foi possivel gravar ${START_FILE}`, () =>
  writeFileSync(resolve(outPath, START_FILE), `import "./${PKG_ENTRY}";\n`),
);

// 6) package.json de runtime — sem "start" o Discloud cai no fallback estatico
//    "serve" e falha com "sh: 1: serve: Permission denied".
step("nao foi possivel gravar o package.json de runtime", () =>
  writeFileSync(
    resolve(outPath, "package.json"),
    JSON.stringify(
      {
        name: "malta",
        private: true,
        type: "module",
        main: START_FILE,
        scripts: { start: `node ${START_FILE}` },
        engines: { node: ">=20" },
      },
      null,
      2,
    ) + "\n",
  ),
);

// 7) Validacao final do pacote.
for (const required of [PKG_ENTRY, START_FILE, "package.json", "discloud.config"]) {
  const p = resolve(outPath, required);
  if (!existsSync(p) || !statSync(p).isFile()) {
    fail(`o pacote foi montado, mas ${OUT_DIR}/${required} nao existe. Nao suba o zip assim.`);
  }
}

// 8) Teste de start real: o servidor tem que subir com "node server.mjs".
const smoke = spawnSync(process.execPath, ["--input-type=module", "-e", SMOKE_SCRIPT], {
  cwd: outPath,
  encoding: "utf8",
  env: { ...process.env, PORT: "43117", HOST: "127.0.0.1" },
  timeout: 60_000,
});
if (smoke.status !== 0) {
  fail(
    `o servidor nao iniciou com "node ${START_FILE}".\n` +
      `${(smoke.stderr || smoke.stdout || "sem saida").trim()}`,
  );
}
console.log(`[build:discloud] start testado localmente: node ${START_FILE} respondeu HTTP.`);

// 9) Zip pronto para upload (sem compactacao manual).
const zipPath = resolve(cwd, ZIP_NAME);
rmSync(zipPath, { force: true });
const zipRun = spawnSync("zip", ["-r", "-q", zipPath, "."], { cwd: outPath, encoding: "utf8", shell: true });
const zipped = zipRun.status === 0 && existsSync(zipPath);
if (!zipped) {
  warnings.push(
    `nao foi possivel gerar o ${ZIP_NAME} automaticamente (o utilitario "zip" pode nao existir aqui). ` +
      `Compacte manualmente o CONTEUDO de dentro de ${OUT_DIR}/.`,
  );
}

for (const w of warnings) console.warn(`\n[build:discloud] AVISO: ${w}`);

console.log(`\n[build:discloud] OK -> pacote pronto em ${OUT_DIR}/`);
console.log("[build:discloud] Conteudo na RAIZ do zip:");
console.log("  server.mjs     (MAIN do discloud.config)");
console.log("  package.json   (start = node server.mjs)");
console.log("  discloud.config");
console.log("  output/server/index.mjs");
console.log(existsSync(envPath) ? "  .env" : "  .env  <-- AUSENTE");
if (zipped) console.log(`\n[build:discloud] Suba este arquivo: ${ZIP_NAME}`);
