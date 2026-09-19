import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {readFileSync, writeFileSync, existsSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const git = args => execFileSync("git", args, {cwd: root, encoding: "utf8"}).trim();
const relevant = file => /^app\/webgl-generator\/src\/(ui|assets)\//.test(file) || /^app\/webgl-generator\/.*\.(css|html)$/.test(file) || /^app\/webgl-generator\/src\/runtime\/object-(details-actions|kinds)\.js$/.test(file) || /^tools\/(ui-layout-|webgl-generator-ui-layout-)/.test(file) || [".githooks/pre-commit", "vite.config.mjs"].includes(file);
const receiptPath = () => path.resolve(root, git(["rev-parse", "--git-path", "ui-layout-receipt.json"]));

export function layoutFingerprint(staged = false) {
  const files = git(["ls-files", "-z", "--cached", ...(staged ? [] : ["--others", "--exclude-standard"])]).split("\0").filter(relevant);
  const hash = createHash("sha256");
  for (const file of [...new Set(files)].sort()) {
    hash.update(file).update("\0");
    const content = staged ? execFileSync("git", ["show", `:${file}`], {cwd: root, maxBuffer: 16 * 1024 * 1024}) : readFileSync(path.join(root, file));
    hash.update(/\.(vue|js|mjs|css|html|svg)$/.test(file) || file === ".githooks/pre-commit" ? content.toString("utf8").replace(/\r\n/g, "\n") : content);
  }
  return hash.digest("hex");
}

export function saveLayoutReceipt(report, fingerprint) {
  if (!report.accepted || report.mode !== "完整验收" || report.errors.length || !report.cases.length) throw Error("只有完整通过的验收可以签发提交凭据");
  if (layoutFingerprint() !== fingerprint) throw Error("验收期间相关源码发生变化，不能签发凭据");
  writeFileSync(receiptPath(), JSON.stringify({fingerprint, states: report.cases.length, at: new Date().toISOString()}, null, 2));
}

export function checkLayoutCommit() {
  const changed = git(["diff", "--cached", "--name-only", "--diff-filter=ACMRD"]).split("\n");
  if (!changed.some(relevant)) return console.log("本次提交无界面排版相关改动。");
  const receipt = existsSync(receiptPath()) ? JSON.parse(readFileSync(receiptPath(), "utf8")) : null;
  if (!receipt || receipt.fingerprint !== layoutFingerprint(true)) throw Error("界面验收缺失或已过期。请先构建，再运行 pnpm run check:ui-layout；折行、裁切、重叠或未执行状态不能提交。");
  console.log(`界面提交门通过：${receipt.states} 个状态，凭据与暂存源码一致。`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--install")) {
    let configured = "";
    try {configured = git(["config", "--get", "core.hooksPath"]);} catch {}
    if (configured && configured !== ".githooks") throw Error(`已有 hooksPath=${configured}；请将本检查接入现有 pre-commit，不自动覆盖。`);
    if (!configured && existsSync(path.resolve(root, git(["rev-parse", "--git-path", "hooks/pre-commit"])))) throw Error("已有本地 pre-commit；请接入本检查，不自动覆盖。");
    git(["config", "core.hooksPath", ".githooks"]);console.log("已启用本仓库界面提交门。");
  } else checkLayoutCommit();
}
