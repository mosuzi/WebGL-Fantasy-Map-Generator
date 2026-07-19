#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const report = JSON.parse(readFileSync(resolve(rootDir, "docs/audits/interaction-usability-audit-results.json"), "utf8"));

assert.equal(report.schemaVersion, 1);
assert.equal(report.totals.surfaces, 102);
assert.equal(report.totals.unclassifiedSurfaces, 0);
assert.equal(report.totals.unknownResults, 0);
assert.ok(Object.keys(report.unknownResultBreakdown).length >= 9);
assert.ok(Object.values(report.unknownResultBreakdown).every(value => value === 0));
assert.equal(report.totals.browserCases, 13);
assert.equal(report.totals.browserPassed, 13);
assert.equal(report.totals.browserFailed, 0);
assert.equal(report.totals.mainEvidenceCases, 25);
assert.equal(report.totals.normalEvidence, 11);
assert.equal(report.totals.failureEvidence, 13);
assert.equal(report.totals.notConstructibleEvidence, 1);
assert.equal(report.browser.visualCases.length, 12);
assert.equal(report.browser.mainCases.length, 25);
assert.ok(report.browser.visualCases.every(item => item.ok && item.checks.glError === 0 && item.checks.healthErrors === 0 && item.checks.positiveTabIndex === 0));
assert.equal(report.findings.length, 29);
assert.deepEqual(report.findings.map(item => item.id), [...new Set(report.findings.map(item => item.id))]);
assert.ok(report.findings.every(item => item.reproduction && item.sourceRefs.length > 0 && item.codeObservation && item.browserCaseIds.length && item.recommendation && item.changeClass));
assert.ok(report.findings.filter(item => item.browserConclusion === "已复现").every(item => item.browserEvidence === "E-F"));
assert.equal(report.candidates.length, 9);
assert.ok(report.functionalChangeAppendix.every(item => item.candidateIds.length));
assert.ok(report.retainedDecisions.some(item => item.includes("E-N")));

console.log(JSON.stringify({ok: true, totals: report.totals, reproduced: report.findings.filter(item => item.browserConclusion === "已复现").map(item => item.id), candidates: report.candidates.map(item => item.id)}, null, 2));
