#!/usr/bin/env node
import {execFileSync} from "node:child_process";
import {mkdtemp, mkdir, readFile, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

const releaseCommit = "4810b23";
const sourceDirectory = "app/webgl-generator/src/runtime";
const sourceNames = ["webfmg-v3-container.js", "canonical-map-field-registry.js", "compact-binary-value-codec.js"];
const tempRoot = await mkdtemp(join(tmpdir(), "fmg-historical-save-"));
await writeFile(join(tempRoot, "package.json"), '{"type":"module"}\n');
for (const name of sourceNames) {
  const content = execFileSync("git", ["show", `${releaseCommit}:${sourceDirectory}/${name}`], {encoding: "utf8"});
  await writeFile(join(tempRoot, name), content);
}
const {encodeWebfmgV3Document} = await import(pathToFileURL(join(tempRoot, "webfmg-v3-container.js")).href);
const source = JSON.parse(await readFile(new URL("./fixtures/webgl-map-v2-legacy-city.json", import.meta.url), "utf8"), (_key, value) => {
  const Constructor = value?.__webglGeneratorTypedArray && globalThis[value.__webglGeneratorTypedArray];
  return typeof Constructor === "function" ? new Constructor(value.data || []) : value;
});
const target = new URL("./fixtures/webgl-map-v2-legacy-city-0.2.12.webfmg", import.meta.url);
await mkdir(new URL("./fixtures/", import.meta.url), {recursive: true});
const bytes = encodeWebfmgV3Document(source);
await writeFile(target, bytes);
console.log(JSON.stringify({releaseCommit, target: target.pathname, bytes: bytes.byteLength}));
