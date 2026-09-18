import assert from "node:assert/strict";
import {pngOutputSize,assertPngBudget} from "../app/webgl-generator/src/runtime/png-export-size.js";
assert.deepEqual(pngOutputSize(2400,null,2),{width:2400,height:1200});
assert.throws(()=>pngOutputSize(2400,1300,2),/比例/);
for(const value of [0,-1,Infinity,1.2,9000])assert.throws(()=>pngOutputSize(value,null,1));
assert.throws(()=>assertPngBudget(8192,8192),/预算/);
assert.throws(()=>assertPngBudget(4096,2048,2048),/预算/);
console.log("PNG 明确尺寸：比例、整数、画布及显卡预算通过");
