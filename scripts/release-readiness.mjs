#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const repoArgIndex = process.argv.indexOf("--repo");
const repo = repoArgIndex === -1 ? "iiwish/kirje" : process.argv[repoArgIndex + 1];
const legacyUpdaterPubkey =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDM0NjlFREYzMjVBRDYwRjMKUldUellLMGw4KzFwTkJ4RmJ0ejArWUNTZTEzT01SMnJveHc4K3ErNHVIdEVuYmZmYW94U295QzcK";

const requiredSecrets = [
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
  "HOMEBREW_TAP_TOKEN",
  "APPLE_CERTIFICATE",
  "APPLE_CERTIFICATE_PASSWORD",
  "APPLE_SIGNING_IDENTITY",
  "APPLE_ID",
  "APPLE_PASSWORD",
  "APPLE_TEAM_ID",
];

const checks = [];
const notes = [];

function addCheck(ok, label, detail) {
  checks.push({ ok, label, detail });
}

function addNote(label, detail) {
  notes.push({ label, detail });
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function getVariables() {
  try {
    return JSON.parse(gh(["variable", "list", "--repo", repo, "--json", "name,value"]));
  } catch (error) {
    addCheck(false, "GitHub variables readable", String(error.message ?? error));
    return [];
  }
}

function getSecrets() {
  try {
    return JSON.parse(gh(["secret", "list", "--repo", repo, "--json", "name,updatedAt"]));
  } catch (error) {
    addCheck(false, "GitHub secrets readable", String(error.message ?? error));
    return [];
  }
}

function repoExists(nameWithOwner) {
  try {
    gh(["repo", "view", nameWithOwner, "--json", "nameWithOwner"]);
    return true;
  } catch {
    return false;
  }
}

const tauriConfig = readJson("src-tauri/tauri.conf.json");
const variables = getVariables();
const secrets = getSecrets();
const variableMap = new Map(variables.map((variable) => [variable.name, variable.value]));
const secretNames = new Set(secrets.map((secret) => secret.name));

addCheck(tauriConfig.productName === "Kirje", "Tauri productName is Kirje", tauriConfig.productName);
addCheck(
  tauriConfig.identifier === "app.kirje.desktop",
  "Tauri identifier is app.kirje.desktop",
  tauriConfig.identifier,
);
addCheck(
  JSON.stringify(tauriConfig.plugins?.sql?.preload) === JSON.stringify(["sqlite:kirje.db"]),
  "Tauri SQL preload uses kirje.db",
  JSON.stringify(tauriConfig.plugins?.sql?.preload),
);
addCheck(
  tauriConfig.plugins?.updater?.endpoints?.includes(
    "https://github.com/iiwish/kirje/releases/latest/download/latest.json",
  ),
  "Updater endpoint points to Kirje GitHub releases",
  JSON.stringify(tauriConfig.plugins?.updater?.endpoints),
);
addCheck(
  tauriConfig.plugins?.updater?.pubkey &&
    tauriConfig.plugins.updater.pubkey !== legacyUpdaterPubkey,
  "Updater public key is Kirje-owned",
  "current key still matches the inherited Velo-era key",
);

const releaseFlag = variableMap.get("KIRJE_RELEASES_ENABLED");
if (releaseFlag === "true") {
  addNote("KIRJE_RELEASES_ENABLED", "true; release workflows are enabled");
} else {
  addNote(
    "KIRJE_RELEASES_ENABLED",
    releaseFlag === undefined
      ? "missing; release workflows remain frozen"
      : `${releaseFlag}; release workflows remain frozen`,
  );
}

for (const secretName of requiredSecrets) {
  addCheck(secretNames.has(secretName), `Secret ${secretName} is configured`, "missing");
}

addCheck(repoExists("iiwish/homebrew-kirje"), "Homebrew tap iiwish/homebrew-kirje exists", "missing");

const failed = checks.filter((check) => !check.ok);

console.log("Kirje release readiness");
console.log(`Repository: ${repo}`);
console.log("");

for (const check of checks) {
  const status = check.ok ? "PASS" : "FAIL";
  console.log(`${status} ${check.label}`);
  if (!check.ok && check.detail) {
    console.log(`     ${check.detail}`);
  }
}

for (const note of notes) {
  console.log(`INFO ${note.label}`);
  console.log(`     ${note.detail}`);
}

console.log("");

if (failed.length > 0) {
  console.error(`Release readiness failed: ${failed.length} blocker(s).`);
  console.error("Do not enable release workflows until every blocker is resolved.");
  process.exit(1);
}

console.log("Release readiness passed. It is safe to perform a controlled draft release.");
