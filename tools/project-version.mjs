#!/usr/bin/env node
import {execFileSync} from "node:child_process";
import {readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const releaseLevels = new Set(["patch", "minor", "major"]);

export function parseProjectVersion(value) {
  const text = String(value ?? "");
  const match = text.match(versionPattern);
  if (!match) throw new Error(`项目版本必须是无前导零的三段数字语义版本：${text || "<empty>"}`);
  return Object.freeze({major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), text});
}

export function compareProjectVersions(first, second) {
  const a = typeof first === "string" ? parseProjectVersion(first) : first;
  const b = typeof second === "string" ? parseProjectVersion(second) : second;
  return Math.sign(a.major - b.major || a.minor - b.minor || a.patch - b.patch);
}

export function incrementProjectVersion(version, release = "patch") {
  const current = typeof version === "string" ? parseProjectVersion(version) : version;
  if (!releaseLevels.has(release)) throw new Error(`版本级别只允许 patch / minor / major：${release}`);
  if (release === "major") return `${current.major + 1}.0.0`;
  if (release === "minor") return `${current.major}.${current.minor + 1}.0`;
  return `${current.major}.${current.minor}.${current.patch + 1}`;
}

export function prepareNextProjectVersion(currentVersion, baseVersion, release = "patch") {
  const current = parseProjectVersion(currentVersion);
  const base = parseProjectVersion(baseVersion);
  const startingVersion = compareProjectVersions(current, base) >= 0 ? current : base;
  return incrementProjectVersion(startingVersion, release);
}

export function assertProjectVersionAhead(currentVersion, baseVersion) {
  const current = parseProjectVersion(currentVersion);
  const base = parseProjectVersion(baseVersion);
  if (compareProjectVersions(current, base) <= 0) {
    throw new Error(`任务分支版本 ${current.text} 必须严格高于主线版本 ${base.text}`);
  }
  return Object.freeze({current: current.text, base: base.text, ahead: true});
}

export function readProjectVersionAtRef(ref, root = repoRoot) {
  if (!String(ref || "").trim()) throw new Error("缺少待比较的 Git ref");
  let source;
  try {
    source = execFileSync("git", ["show", `${ref}:package.json`], {cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]});
  } catch (error) {
    const detail = String(error?.stderr || error?.message || error).trim();
    throw new Error(`无法读取 ${ref}:package.json${detail ? `：${detail}` : ""}`);
  }
  return parsePackageVersion(source, `${ref}:package.json`);
}

export function prepareProjectVersion({release = "patch", baseRef = "origin/main", root = repoRoot} = {}) {
  const packagePath = resolve(root, "package.json");
  const source = readFileSync(packagePath, "utf8");
  const document = parsePackageDocument(source, packagePath);
  const baseVersion = readProjectVersionAtRef(baseRef, root);
  const nextVersion = prepareNextProjectVersion(document.version, baseVersion, release);
  document.version = nextVersion;
  writeFileSync(packagePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return Object.freeze({previous: parsePackageVersion(source, packagePath), base: baseVersion, next: nextVersion, release, baseRef});
}

export function checkProjectVersion({baseRef = "origin/main", root = repoRoot} = {}) {
  const packagePath = resolve(root, "package.json");
  const currentVersion = parsePackageVersion(readFileSync(packagePath, "utf8"), packagePath);
  const baseVersion = readProjectVersionAtRef(baseRef, root);
  return Object.freeze({...assertProjectVersionAhead(currentVersion, baseVersion), baseRef});
}

function parsePackageDocument(source, label) {
  let document;
  try {
    document = JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} 不是合法 JSON：${error.message}`);
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error(`${label} 必须是 JSON 对象`);
  parseProjectVersion(document.version);
  return document;
}

function parsePackageVersion(source, label) {
  return parsePackageDocument(source, label).version;
}

function runCli() {
  const command = process.argv[2] || "check";
  if (command === "prepare") {
    const result = prepareProjectVersion({release: process.argv[3] || "patch", baseRef: process.argv[4] || "origin/main"});
    console.log(JSON.stringify({ok: true, command, ...result}, null, 2));
    return;
  }
  if (command === "check") {
    const result = checkProjectVersion({baseRef: process.argv[3] || "origin/main"});
    console.log(JSON.stringify({ok: true, command, ...result}, null, 2));
    return;
  }
  throw new Error(`未知版本命令：${command}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
