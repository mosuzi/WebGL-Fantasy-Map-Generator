import assert from "node:assert/strict";
import {recoveryPruneIds} from "../app/webgl-generator/src/runtime/map-recovery.js";
const point = (id, createdAt, writerId = "a", bytes = 10) => ({id, createdAt, writerId, documentId: "doc", bytes});
const newest = point("new", 9);
assert.deepEqual(recoveryPruneIds([point("a", 1), point("b", 2), point("c", 3)], newest, 100), ["a"]);
assert.deepEqual(recoveryPruneIds([point("a", 1, "other"), point("b", 2), point("c", 3)], newest, 100), []);
assert.deepEqual(recoveryPruneIds([point("a", 1), point("b", 2), point("c", 3)], newest, 25), ["b", "a"]);
assert.throws(() => recoveryPruneIds([point("old", 1)], point("oversize", 2, "a", 101), 100));
console.log(JSON.stringify({ok: true, cases: 4}));
