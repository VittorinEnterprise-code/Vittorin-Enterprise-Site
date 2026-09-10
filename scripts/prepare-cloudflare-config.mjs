import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const serverDirectory = path.join(projectRoot, "dist", "server");
const configPath = path.join(serverDirectory, "wrangler.json");

const workerName = optional("CLOUDFLARE_WORKER_NAME", "vittorin-enterprise");
const databaseName = optional(
  "CLOUDFLARE_D1_DATABASE_NAME",
  "vittorin-enterprise-db",
);
const databaseId = required("CLOUDFLARE_D1_DATABASE_ID");
const bucketName = optional(
  "CLOUDFLARE_R2_BUCKET_NAME",
  "vittorin-enterprise-media",
);
const teamDomain = normalizeTeamDomain(
  required("CLOUDFLARE_ACCESS_TEAM_DOMAIN"),
);
const policyAudience = required("CLOUDFLARE_ACCESS_AUD");

assertResourceName("CLOUDFLARE_WORKER_NAME", workerName);
assertResourceName("CLOUDFLARE_D1_DATABASE_NAME", databaseName);
assertResourceName("CLOUDFLARE_R2_BUCKET_NAME", bucketName);
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(databaseId)) {
  throw new Error("CLOUDFLARE_D1_DATABASE_ID precisa ser um UUID válido.");
}
if (policyAudience.length > 512 || /\s/.test(policyAudience)) {
  throw new Error("CLOUDFLARE_ACCESS_AUD contém um valor inválido.");
}

let config;
try {
  config = JSON.parse(await readFile(configPath, "utf8"));
} catch (error) {
  throw new Error(
    "O build não gerou dist/server/wrangler.json. Execute pnpm run build primeiro.",
    { cause: error },
  );
}

config.name = workerName;
config.vars = {
  ...(config.vars ?? {}),
  TEAM_DOMAIN: teamDomain,
  POLICY_AUD: policyAudience,
};
config.d1_databases = [
  {
    binding: "DB",
    database_name: databaseName,
    database_id: databaseId,
  },
];
config.r2_buckets = [
  {
    binding: "BUCKET",
    bucket_name: bucketName,
  },
];
config.observability = { enabled: true };

await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

console.log(`Configuração Cloudflare preparada para ${workerName}.`);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Defina a variável de build ${name}.`);
  return value;
}

function optional(name, fallback) {
  return process.env[name]?.trim() || fallback;
}

function assertResourceName(variableName, value) {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(value)) {
    throw new Error(
      `${variableName} deve conter somente letras minúsculas, números e hífens.`,
    );
  }
}

function normalizeTeamDomain(value) {
  const candidate = value.includes("://") ? value : `https://${value}`;
  let url;
  try {
    url = new URL(candidate);
  } catch (error) {
    throw new Error("CLOUDFLARE_ACCESS_TEAM_DOMAIN não é uma URL válida.", {
      cause: error,
    });
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !url.hostname.endsWith(".cloudflareaccess.com")
  ) {
    throw new Error(
      "CLOUDFLARE_ACCESS_TEAM_DOMAIN deve terminar em .cloudflareaccess.com.",
    );
  }
  return url.origin;
}
