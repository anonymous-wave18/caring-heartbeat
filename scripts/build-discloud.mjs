// Build para o Discloud, multiplataforma (Windows/macOS/Linux).
// Uso: npm run build:discloud
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ENTRY = ".output/server/index.mjs";

function fail(msg) {
  console.error(`\n[build:discloud] ERRO: ${msg}\n`);
  process.exit(1);
}

const result = spawnSync("vite", ["build"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NITRO_PRESET: "node-server" },
});

if (result.error) fail(`nao foi possivel executar "vite build": ${result.error.message}`);
if (result.status !== 0) fail(`"vite build" terminou com codigo ${result.status}. Corrija o erro acima antes de montar o zip.`);

const entryPath = resolve(process.cwd(), ENTRY);
if (!existsSync(entryPath) || !statSync(entryPath).isFile()) {
  fail(
    `o build terminou, mas ${ENTRY} nao existe.\n` +
      `Isso normalmente acontece quando NITRO_PRESET nao foi aplicado.\n` +
      `Rode manualmente e verifique a saida:\n` +
      `  NITRO_PRESET=node-server npx vite build        (macOS/Linux)\n` +
      `  $env:NITRO_PRESET="node-server"; npx vite build (Windows PowerShell)`,
  );
}

console.log(`\n[build:discloud] OK -> ${ENTRY} gerado.`);
console.log("[build:discloud] Agora monte o zip com .output/, discloud.config e .env NA RAIZ do zip.");
console.log('[build:discloud] Linux/macOS: rm -f malta.zip && zip -r malta.zip .output discloud.config .env');
console.log("[build:discloud] Confira o conteudo: unzip -l malta.zip | head");
