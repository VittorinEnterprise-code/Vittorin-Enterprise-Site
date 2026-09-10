import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const configPath = fileURLToPath(
  new URL("../dist/server/wrangler.json", import.meta.url),
);
const wranglerPath = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);

if (!existsSync(configPath)) {
  throw new Error(
    "A configuração de produção não existe. Execute pnpm run build:cloudflare primeiro.",
  );
}

run(["deploy", "--config", configPath]);

function run(arguments_) {
  const result = spawnSync(process.execPath, [wranglerPath, ...arguments_], {
    cwd: projectRoot,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
