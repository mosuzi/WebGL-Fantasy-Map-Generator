import assert from "node:assert/strict";
import {terrainClassAt, TERRAIN_ID} from "../app/webgl-generator/src/renderer/terrain-classes.js";

const points = [[0,0], [1,0], [0,1], [-1,0], [0,-1]];
function classify(height, adjacent, biome = 4) {
  const cells = {h: [height, ...adjacent], biome: [biome], c: [[1,2,3,4]]};
  return terrainClassAt({points, cells}, 0);
}
for (const [name, height, neighbors, biome] of [
  ["water", 19.99, [50,50,50,50], 11], ["ice", 32, [30,31,32,32], 11],
  ["desert", 21, [22,20,22,23], 1], ["desert", 52, [51,54,52,51], 2],
  ["marsh", 22, [21,20,24,25], 12], ["plain", 26, [0,27,29,24]],
  ["hills", 46, [42,50,40,45]], ["plateau", 70, [68,71,70,73]],
  ["mountains", 75, [51,66,59,70]], ["canyon", 34, [45,33,46,34]],
  ["hills", 34, [45,45,33,34]], ["hills", 34, [45,46,45,45]]
]) assert.equal(classify(height, neighbors, biome), TERRAIN_ID[name], name);
console.log("地形分类通过，覆盖水陆阈值、两类荒漠、抬升平地、峡壁、单坡及凹坑。");
