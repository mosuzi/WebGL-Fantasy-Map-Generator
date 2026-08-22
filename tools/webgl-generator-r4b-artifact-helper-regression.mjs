#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {closeTask350BrowserResource, createTask350BrowserArtifact} from "./task-350-browser-artifact.mjs";

const root = resolve(process.env.TASK_350_CDP_ARTIFACT_DIR || join(process.cwd(), "work", "task-350-cdp-artifacts"));
process.env.TASK_350_CDP_ARTIFACT_DIR = join(root, "r4b-artifact-helper-self-test");

const success = createTask350BrowserArtifact("r4b-success", {mode: "self-test"});
success.mark("assertions", {active: "fixture", complete: "page-ready"});
success.setResult({raw: {value: 7}}, {value: 7});
success.succeed();
const successPaths = success.persist();
assert.equal(JSON.parse(readFileSync(successPaths.fullPath, "utf8")).ok, true);
assert.equal(JSON.parse(readFileSync(successPaths.summaryPath, "utf8")).result.value, 7);

const failure = createTask350BrowserArtifact("r4b-failure", {mode: "self-test"});
failure.mark("browser-evaluation", {active: "export"});
failure.fail(Object.assign(new Error("functional failure"), {code: "functional_failure"}));
const failurePaths = failure.persist();
assert.equal(JSON.parse(readFileSync(failurePaths.fullPath, "utf8")).failure.code, "functional_failure");

const teardown = createTask350BrowserArtifact("r4b-teardown", {mode: "self-test"});
teardown.succeed();
teardown.failTeardown(Object.assign(new Error("teardown failure"), {code: "teardown_failure"}));
const teardownPaths = teardown.persist();
assert.equal(JSON.parse(readFileSync(teardownPaths.summaryPath, "utf8")).ok, false);

const timeout = createTask350BrowserArtifact("r4b-teardown-timeout", {mode: "self-test"});
timeout.succeed();
try {
  await closeTask350BrowserResource("server", () => new Promise(() => {}), 5);
  assert.fail("server 永不 exit 时必须拒绝");
} catch (error) {
  assert.equal(error?.code, "browser_teardown_timeout");
  timeout.failTeardown(error);
}
const timeoutPaths = timeout.persist();
const timeoutSummary = JSON.parse(readFileSync(timeoutPaths.summaryPath, "utf8"));
assert.equal(timeoutSummary.ok, false);
assert.equal(timeoutSummary.failure.code, "browser_teardown_timeout");
assert.equal(timeoutSummary.teardownFailures.length, 1);

console.log(JSON.stringify({ok: true, success: successPaths, failure: failurePaths, teardown: teardownPaths, timeout: timeoutPaths}, null, 2));
