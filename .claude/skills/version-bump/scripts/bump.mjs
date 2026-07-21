#!/usr/bin/env node
/**
 * Applies a semantic version bump across every file in this repo that carries
 * a version string. Deterministic and idempotent-safe: it never guesses the
 * bump level, it only applies the one you pass.
 *
 * Usage (from the repo root):
 *   node .claude/skills/version-bump/scripts/bump.mjs --level minor
 *   node .claude/skills/version-bump/scripts/bump.mjs --set 1.0.0
 *   node .claude/skills/version-bump/scripts/bump.mjs --level patch --dry-run
 *
 * Edits are surgical regex replacements, not JSON re-serialization, so
 * package.json keeps its exact formatting and the diff stays one line.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const dryRun = args.includes("--dry-run");
const level = flag("--level");
const explicit = flag("--set");

if (!level && !explicit) {
  console.error("error: pass --level patch|minor|major or --set X.Y.Z");
  process.exit(1);
}

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const pkgPath = join(root, "package.json");
const pkgRaw = readFileSync(pkgPath, "utf8");

const currentMatch = pkgRaw.match(/"version"\s*:\s*"(\d+)\.(\d+)\.(\d+)"/);
if (!currentMatch) {
  console.error("error: could not find a semver `\"version\": \"x.y.z\"` in package.json");
  process.exit(1);
}
const [, majS, minS, patS] = currentMatch;
const current = `${majS}.${minS}.${patS}`;

let next;
if (explicit) {
  if (!/^\d+\.\d+\.\d+$/.test(explicit)) {
    console.error(`error: --set expects X.Y.Z, got "${explicit}"`);
    process.exit(1);
  }
  next = explicit;
} else {
  const [maj, min, pat] = [Number(majS), Number(minS), Number(patS)];
  if (level === "major") next = `${maj + 1}.0.0`;
  else if (level === "minor") next = `${maj}.${min + 1}.0`;
  else if (level === "patch") next = `${maj}.${min}.${pat + 1}`;
  else {
    console.error(`error: --level must be patch|minor|major, got "${level}"`);
    process.exit(1);
  }
}

if (next === current) {
  console.error(`error: target version ${next} equals the current version — nothing to do`);
  process.exit(1);
}

// Local date, not toISOString() — UTC would stamp "yesterday" for anyone east
// of Greenwich working in the morning.
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
const changed = [];

// 1. package.json — the single source of truth. src/lib/version.ts imports it,
//    so every UI surface (login / register / home footer / admin sidebar)
//    follows automatically and needs no edit.
if (!dryRun) {
  writeFileSync(pkgPath, pkgRaw.replace(currentMatch[0], `"version": "${next}"`));
}
changed.push(`package.json  ${current} -> ${next}`);

// 2. docs/guides/*.md carry their own `**Version**: X.Y.Z | **Last Updated**: date`
//    header. They track the app version, and the date moves with the bump.
const guidesDir = join(root, "docs", "guides");
if (existsSync(guidesDir)) {
  for (const file of readdirSync(guidesDir).filter((f) => f.endsWith(".md"))) {
    const p = join(guidesDir, file);
    const raw = readFileSync(p, "utf8");
    const hdr = raw.match(/\*\*Version\*\*:\s*(\d+\.\d+\.\d+)\s*\|\s*\*\*Last Updated\*\*:\s*(\d{4}-\d{2}-\d{2})/);
    if (!hdr) continue;
    const replaced = raw.replace(hdr[0], `**Version**: ${next} | **Last Updated**: ${today}`);
    if (replaced === raw) continue;
    if (!dryRun) writeFileSync(p, replaced);
    changed.push(`docs/guides/${file}  ${hdr[1]} -> ${next}, ${hdr[2]} -> ${today}`);
  }
}

console.log(`${dryRun ? "[dry-run] " : ""}${current} -> ${next}`);
for (const line of changed) console.log(`  ${line}`);
