import {existsSync, readFileSync} from "node:fs";
import {dirname, extname, resolve} from "node:path";

export const PACKAGE_BROWSER_FORBIDDEN = /browser|playwright|puppeteer|selenium|chrom(?:e|ium)|\bcdp\b|devtools|web-driver|webdriver|vite\s+(?:dev|preview)|--host\b/iu;

export function findBrowserLaunchers({root, entrypoint, scanned = new Set()}) {
  const findings = [];
  scan(entrypoint);
  return findings;

  function scan(file) {
    const path = resolveToolModule(root, file);
    if (!path || scanned.has(path)) return;
    scanned.add(path);
    const source = readFileSync(path, "utf8");
    for (const [label, pattern] of [
      ["browser-driver-package", /["'](?:playwright(?:-core)?|puppeteer(?:-core)?|selenium-webdriver)["']/giu],
      ["browser-launch", /\b(?:chromium|firefox|webkit|puppeteer)\s*\.\s*launch(?:PersistentContext)?\s*\(/giu],
      ["cdp-session", /\b(?:connectOverCDP|createCDPSession)\s*\(/gu],
      ["webdriver", /\b(?:WebDriver|webdriver)\b/gu],
      ["browser-process", /\b(?:spawn|execFile)\s*\([^\n]*(?:chrome|chromium|msedge)/giu]
    ]) {
      if (pattern.test(source)) findings.push(`${label}:${path.slice(root.length + 1).replaceAll("\\", "/")}`);
    }
    for (const imported of extractLocalImports(source)) {
      const target = resolve(dirname(path), imported);
      if (isToolPath(root, target)) scan(target);
    }
  }
}

export function extractLocalImports(source) {
  const imports = new Set();
  for (const pattern of [
    /\bfrom\s*["'](\.{1,2}\/[^"']+)["']/gu,
    /\bimport\s*["'](\.{1,2}\/[^"']+)["']/gu,
    /\bimport\s*\(\s*["'](\.{1,2}\/[^"']+)["']/gu,
    /\brequire\s*\(\s*["'](\.{1,2}\/[^"']+)["']/gu
  ]) {
    for (const match of source.matchAll(pattern)) imports.add(match[1]);
  }
  return [...imports];
}

function resolveToolModule(root, path) {
  for (const candidate of extname(path) ? [path] : [path, `${path}.mjs`, `${path}.js`, `${path}.ts`, resolve(path, "index.mjs"), resolve(path, "index.js")]) {
    if (existsSync(candidate) && isToolPath(root, candidate)) return resolve(candidate);
  }
  return null;
}

function isToolPath(root, path) {
  const toolsRoot = resolve(root, "tools");
  const normalized = resolve(path);
  return normalized === toolsRoot || normalized.startsWith(`${toolsRoot}\\`) || normalized.startsWith(`${toolsRoot}/`);
}
