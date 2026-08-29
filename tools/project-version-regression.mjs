#!/usr/bin/env node
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {
  assertProjectVersionAhead,
  checkProjectVersion,
  compareProjectVersions,
  incrementProjectVersion,
  parseProjectVersion,
  prepareProjectVersion,
  prepareNextProjectVersion
} from "./project-version.mjs";

assert.deepEqual(parseProjectVersion("0.5.83"), {major: 0, minor: 5, patch: 83, text: "0.5.83"});
for (const value of ["", "1", "1.2", "1.2.3.4", "01.2.3", "1.02.3", "1.2.03", "v1.2.3", "1.2.x", "-1.2.3"]) {
  assert.throws(() => parseProjectVersion(value), /三段数字语义版本/, `非法版本未被拒绝：${value}`);
}

assert.equal(compareProjectVersions("0.5.83", "0.5.79"), 1);
assert.equal(compareProjectVersions("0.5.83", "0.5.83"), 0);
assert.equal(compareProjectVersions("0.5.79", "0.5.83"), -1);
assert.equal(compareProjectVersions("1.0.0", "0.99.999"), 1);

assert.equal(incrementProjectVersion("0.5.83", "patch"), "0.5.84");
assert.equal(incrementProjectVersion("0.5.83", "minor"), "0.6.0");
assert.equal(incrementProjectVersion("0.5.83", "major"), "1.0.0");
assert.throws(() => incrementProjectVersion("0.5.83", "build"), /patch \/ minor \/ major/);

assert.equal(prepareNextProjectVersion("0.5.83", "0.5.79", "patch"), "0.5.84", "任务分支领先时应从任务版本递增");
assert.equal(prepareNextProjectVersion("0.5.79", "0.6.0", "patch"), "0.6.1", "主线领先时应从主线版本递增");
assert.equal(prepareNextProjectVersion("0.5.83", "0.5.83", "minor"), "0.6.0");
assert.deepEqual(assertProjectVersionAhead("0.5.84", "0.5.83"), {current: "0.5.84", base: "0.5.83", ahead: true});
assert.throws(() => assertProjectVersionAhead("0.5.83", "0.5.83"), /必须严格高于/);
assert.throws(() => assertProjectVersionAhead("0.5.82", "0.5.83"), /必须严格高于/);

const temporaryRoot = mkdtempSync(join(tmpdir(), "fmg-project-version-"));
try {
  const packagePath = join(temporaryRoot, "package.json");
  const sentinelPath = join(temporaryRoot, "sentinel.txt");
  writeFileSync(packagePath, `${JSON.stringify({name: "fixture", version: "0.5.83"}, null, 2)}\n`, "utf8");
  writeFileSync(sentinelPath, "unchanged\n", "utf8");
  execFileSync("git", ["init", "--quiet"], {cwd: temporaryRoot});
  execFileSync("git", ["config", "user.name", "version-regression"], {cwd: temporaryRoot});
  execFileSync("git", ["config", "user.email", "version-regression@example.invalid"], {cwd: temporaryRoot});
  execFileSync("git", ["add", "package.json", "sentinel.txt"], {cwd: temporaryRoot});
  execFileSync("git", ["commit", "--quiet", "-m", "base"], {cwd: temporaryRoot});
  writeFileSync(packagePath, `${JSON.stringify({name: "fixture", version: "0.5.82"}, null, 2)}\n`, "utf8");
  assert.deepEqual(prepareProjectVersion({root: temporaryRoot, baseRef: "HEAD"}), {
    previous: "0.5.82", base: "0.5.83", next: "0.5.84", release: "patch", baseRef: "HEAD"
  });
  assert.equal(JSON.parse(readFileSync(packagePath, "utf8")).version, "0.5.84");
  assert.equal(readFileSync(sentinelPath, "utf8"), "unchanged\n", "版本准备不得改写 package.json 之外的文件");
  assert.deepEqual(checkProjectVersion({root: temporaryRoot, baseRef: "HEAD"}), {current: "0.5.84", base: "0.5.83", ahead: true, baseRef: "HEAD"});
  writeFileSync(packagePath, `${JSON.stringify({name: "fixture", version: "0.5.83"}, null, 2)}\n`, "utf8");
  assert.throws(() => checkProjectVersion({root: temporaryRoot, baseRef: "HEAD"}), /必须严格高于/);
} finally {
  const resolvedTemporaryRoot = resolve(temporaryRoot);
  if (!resolvedTemporaryRoot.startsWith(resolve(tmpdir()))) throw new Error(`拒绝清理非临时目录：${resolvedTemporaryRoot}`);
  rmSync(resolvedTemporaryRoot, {recursive: true, force: true});
}

const source = readFileSync(new URL("./project-version.mjs", import.meta.url), "utf8");
for (const contract of ["execFileSync(\"git\", [\"show\"", "prepareNextProjectVersion", "assertProjectVersionAhead", "writeFileSync(packagePath", "origin/main"]) {
  assert.ok(source.includes(contract), `版本工具缺少契约：${contract}`);
}

console.log(JSON.stringify({
  ok: true,
  strictSemver: true,
  releaseLevels: ["patch", "minor", "major"],
  currentAhead: prepareNextProjectVersion("0.5.83", "0.5.79"),
  baseAhead: prepareNextProjectVersion("0.5.79", "0.6.0"),
  isolatedWriteSet: ["package.json"],
  failClosedChecks: 4
}, null, 2));
