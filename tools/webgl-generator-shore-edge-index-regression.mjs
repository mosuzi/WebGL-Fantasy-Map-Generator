import assert from "node:assert/strict";
import {createShoreEdgeIndex, shoreEdgeId} from "../app/webgl-generator/src/renderer/shore-edge-index.js";

const index = createShoreEdgeIndex(point => point.join(":"));
const shore = (landCell, waterCell, a, b) => ({landCell, waterCell, a, b, side: {x: 0, y: 1}});
const a = [0, 0], b = [1, 0], c = [2, 0], d = [3, 0], e = [4, 0];
const first = shore(1, 2, a, b);
const second = shore(2, 3, b, c);
const retainedEdge = shore(7, 8, d, e);
const original = {points: [a, b, c], sourceEdges: [first, second]};
const retained = {points: [d, e], sourceEdges: [retainedEdge]};
const before = [original, retained];
index.prepare(before);
assert.deepEqual([...index.pathsForCell(2)], [original]);
assert.deepEqual([...index.pathsForVertex(b)], [original]);
assert.equal(index.readEdge(first).rawEdge, first);

const flipped = {...first, landCell: 2, waterCell: 1};
const resulting = {points: [a, b], sourceEdges: [flipped]};
const after = [resulting, retained];
assert.equal(shoreEdgeId(first), shoreEdgeId(flipped));
index.apply(after, [original], [resulting]);
assert.equal(index.paths, after);
assert.equal(index.readEdge(first).rawEdge, flipped);
assert.equal(index.readEdge(first).path, resulting);
assert.equal(index.pathsForCell(3).size, 0);
assert.equal(index.readEdge(second), undefined);
assert.equal(index.readEdge(retainedEdge).rawEdge, retainedEdge);
assert.deepEqual([...index.pathsForVertex(c)], []);

index.apply(before, [resulting], [original]);
assert.deepEqual([...index.pathsForCell(3)], [original]);
assert.equal(index.readEdge(first).rawEdge, first);
assert.equal(index.readEdge(retainedEdge).path, retained);
console.log("通过海岸原始边、双侧格、顶点和岸段增量索引验证");
