import assert from "node:assert/strict";
import fs from "node:fs";

import {
  snapshotViewportCamera,
  viewportBufferTransform
} from "../app/webgl-generator/src/renderer/viewport-buffer-transform.js";

const identity = viewportBufferTransform(
  {scale: 2, offsetX: 0.25, offsetY: -0.4},
  {scale: 2, offsetX: 0.25, offsetY: -0.4}
);
assert.deepEqual(identity, {scale: 1, offsetX: 0, offsetY: 0});

const pan = viewportBufferTransform(
  {scale: 2, offsetX: 0.25, offsetY: -0.4},
  {scale: 2, offsetX: 0.55, offsetY: -0.1}
);
assert.deepEqual(pan, {scale: 1, offsetX: 0.30000000000000004, offsetY: 0.30000000000000004});

const zoom = viewportBufferTransform(
  {scale: 2, offsetX: 0.25, offsetY: -0.4},
  {scale: 5, offsetX: -0.1, offsetY: 0.35}
);
assert.deepEqual(zoom, {scale: 2.5, offsetX: -0.725, offsetY: 1.35});

const sourceCamera = snapshotViewportCamera({scale: 1.75, offsetX: 0.2, offsetY: -0.3});
const targetCamera = snapshotViewportCamera({scale: 3.5, offsetX: -0.15, offsetY: 0.1});
const transform = viewportBufferTransform(sourceCamera, targetCamera);
for (const point of [[-1, -1], [-0.25, 0.7], [0, 0], [0.8, -0.4], [1, 1]]) {
  const sourceNdc = [
    point[0] * sourceCamera.scale + sourceCamera.offsetX,
    point[1] * sourceCamera.scale + sourceCamera.offsetY
  ];
  const transformed = [
    sourceNdc[0] * transform.scale + transform.offsetX,
    sourceNdc[1] * transform.scale + transform.offsetY
  ];
  const direct = [
    point[0] * targetCamera.scale + targetCamera.offsetX,
    point[1] * targetCamera.scale + targetCamera.offsetY
  ];
  assert.ok(Math.abs(transformed[0] - direct[0]) < 1e-12);
  assert.ok(Math.abs(transformed[1] - direct[1]) < 1e-12);
}

const rendererSource = fs.readFileSync(
  new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url),
  "utf8"
);
assert.match(rendererSource, /viewportBufferTransform\(this\.routeBufferCamera, this\.camera\)/);
assert.match(rendererSource, /viewportBufferTransform\(this\.riverBufferCamera, this\.camera\)/);
assert.match(rendererSource, /if \(this\.layerVisibility\.routes\) \{[\s\S]*layerOrder\.push\("routes"\)/);
assert.match(rendererSource, /if \(this\.layerVisibility\.rivers\) \{[\s\S]*layerOrder\.push\("rivers"\)/);
assert.match(rendererSource, /this\.routeBufferCamera = snapshotViewportCamera\(camera\)/);
assert.match(rendererSource, /this\.riverBufferCamera = snapshotViewportCamera\(camera\)/);
assert.equal(
  [...rendererSource.matchAll(/this\.routeVertexCount = 0;\s+this\.routeDrawRanges = emptyRouteDrawRanges\(\);\s+this\.riverVertexCount = 0;/g)].length,
  2,
  "同步与异步切图都必须同时清空道路 draw ranges、道路与河流顶点计数"
);
assert.match(rendererSource, /const shouldContinue = \(\) => this\.viewportCommitVersion === version/);
const flushStart = rendererSource.indexOf("  flushViewportPreview() {");
const flushEnd = rendererSource.indexOf("\n\n  suspendOverlayForInteraction()", flushStart);
assert.ok(flushStart >= 0 && flushEnd > flushStart, "无法提取 flushViewportPreview 方法");
const flushSource = rendererSource.slice(flushStart, flushEnd);
const previewDrawPattern = /this\.draw\(\{\s*updateDynamicBuffers: false,\s*updateOverlay: false,\s*drawDirtyDynamicBuffers: false,\s*viewportPreview: true\s*\}\);/u;
assert.equal((flushSource.match(/this\.draw\(/gu) || []).length, 1, "flushViewportPreview 必须只有一个直接 draw 调用");
assert.match(flushSource, previewDrawPattern, "flushViewportPreview 没有把直接 draw 标记为 viewportPreview");
const disabledPreviewMutation = flushSource.replace("viewportPreview: true", "viewportPreview: false");
assert.notEqual(disabledPreviewMutation, flushSource, "viewportPreview true→false mutation 未命中");
assert.doesNotMatch(disabledPreviewMutation, previewDrawPattern, "viewportPreview 被关闭后仍通过专项契约");
assert.match(rendererSource, /const glErrorChecked = !viewportPreview;\s+const glError = glErrorChecked \? gl\.getError\(\) : Number\(this\.lastDraw\?\.glError \|\| 0\);/, "viewport preview 仍逐帧同步读取 GL error");
assert.match(rendererSource, /this\.lastDraw = \{\s+sequence: event\.sequence,\s+drawMs,\s+glError,\s+glErrorChecked,/u, "draw stats 没有区分 GL error 是否本帧检查");
assert.match(rendererSource, /matrix\(\$\{preview\.scale\}, 0, 0, \$\{preview\.scale\}, \$\{preview\.translateX\}, \$\{preview\.translateY\}\)/, "实际 overlay 矩阵没有消费设备像素对齐后的平移值");
assert.match(rendererSource, /const VIEWPORT_LINE_OVERSCAN_RATIO = 0\.5;/, "道路与河流没有使用半个视口的自适应预取范围");
assert.match(rendererSource, /const VIEWPORT_LINE_OVERSCAN_MAX_CSS_PX = 720;/, "道路与河流预取范围缺少显式性能上限");
assert.equal([...rendererSource.matchAll(/viewportWorldBounds\(map, camera, canvas, viewportLineOverscanBackingPx\(canvas\)\)/g)].length, 2, "道路与河流没有共同使用自适应预取范围");

console.log(JSON.stringify({
  ok: true,
  identity,
  pan,
  zoom,
  pointCases: 5,
  staleCancellation: true,
  dirtyPreviewLayers: ["routes", "rivers"],
  adaptiveOverscan: {ratio: 0.5, maxCssPx: 720},
  previewGlErrorSync: false
}, null, 2));
