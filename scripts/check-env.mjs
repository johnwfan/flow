#!/usr/bin/env node
// Dependency-free presence check for the env vars apps/api, apps/web, and
// apps/agent need. Never reads or prints a value -- only whether a key is
// set and non-empty, exactly like the checks already in apps/api/src/index.ts
// (dotenv.config() -> `if (!process.env[key])`), just run up front so a
// missing var is one clear message instead of a crash mid-boot.
//
// Run directly: `node scripts/check-env.mjs` (also used by dev-all.mjs and
// smoke-test.mjs before they start anything).
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT_ENV_PATH = join(repoRoot, ".env");
const AGENT_ENV_PATH = join(repoRoot, "apps", "agent", ".env");

/** Parses KEY=value lines just far enough to know which keys are non-empty. */
function parseEnvFile(path) {
  const keys = new Set();
  if (!existsSync(path)) return keys;
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value.length > 0) keys.add(key);
  }
  return keys;
}

// A var also counts as set if it's already in the real process environment
// (shell export, CI secret, etc.), not just a .env file.
function isSet(key, keysFromFile) {
  return keysFromFile.has(key) || Boolean(process.env[key]);
}

const ROOT_VARS = [
  {
    key: "TIGER_CLOUD_URL",
    level: "required",
    usedBy: "api",
    why: "apps/api connects to Tiger Cloud on boot and exits if the query fails.",
    fix: "Set TIGER_CLOUD_URL in .env to your Tiger Cloud (TimescaleDB) connection string -- see .env.example.",
  },
  {
    key: "GEMINI_API_KEY",
    level: "optional",
    usedBy: "api",
    why: "Session narratives and cross-session insights fall back to canned text without it.",
    fix: "Set GEMINI_API_KEY in .env -- see .env.example.",
  },
  {
    key: "ELEVENLABS_API_KEY",
    level: "optional",
    usedBy: "api",
    why: "POST /v1/speak (breathing-guide/nudge audio) returns an error without it.",
    fix: "Set ELEVENLABS_API_KEY in .env -- see .env.example.",
  },
];

const AGENT_VARS = [
  {
    key: "SMARTSPECTRA_API_KEY",
    usedBy: "agent --real",
    why: "The agent needs it to talk to the SmartSpectra SDK with a live webcam.",
    fix: "Set SMARTSPECTRA_API_KEY in apps/agent/.env -- see apps/agent/.env.example.",
  },
];

export function checkEnv({ silent = false } = {}) {
  const rootKeys = parseEnvFile(ROOT_ENV_PATH);
  const agentKeys = parseEnvFile(AGENT_ENV_PATH);

  const missingRequired = ROOT_VARS.filter((v) => v.level === "required" && !isSet(v.key, rootKeys));
  const missingOptional = ROOT_VARS.filter((v) => v.level === "optional" && !isSet(v.key, rootKeys));
  const missingAgent = AGENT_VARS.filter((v) => !isSet(v.key, agentKeys));

  if (!silent) {
    if (missingRequired.length > 0) {
      console.error("\n✖ Missing required environment variable(s) -- api will not start:\n");
      for (const v of missingRequired) {
        console.error(`  ${v.key}  (used by ${v.usedBy})`);
        console.error(`    ${v.why}`);
        console.error(`    Fix: ${v.fix}\n`);
      }
    }
    if (missingOptional.length > 0) {
      console.warn("⚠ Optional environment variable(s) not set -- related features will degrade:\n");
      for (const v of missingOptional) {
        console.warn(`  ${v.key}  (used by ${v.usedBy})`);
        console.warn(`    ${v.why}`);
        console.warn(`    Fix: ${v.fix}\n`);
      }
    }
    if (missingRequired.length === 0 && missingOptional.length === 0) {
      console.log("✔ Root .env: all checked variables present.");
    }
    // The agent is launched separately (run.bat/run-demo.bat), not by
    // dev-all.mjs, so this is informational rather than blocking.
    if (missingAgent.length > 0) {
      console.warn("ℹ Agent-only (checked for awareness -- the agent starts separately, not via dev:all):\n");
      for (const v of missingAgent) {
        console.warn(`  ${v.key} not set in apps/agent/.env -- ${v.why}`);
        console.warn(`    Fix: ${v.fix}\n`);
      }
    }
  }

  return {
    missingRequired,
    missingOptional,
    missingAgent,
    ok: missingRequired.length === 0,
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const result = checkEnv();
  process.exit(result.ok ? 0 : 1);
}
