import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  CITY_ICON_BASE_CSS_SIZE,
  CITY_ICON_OUTLINE_STROKE_CSS_PX,
  CITY_ICON_FRAGMENT_SHADER_SOURCE,
  CITY_ICON_INSTANCE_FLOATS,
  CITY_ICON_INSTANCE_STRIDE_BYTES,
  CITY_ICON_ROLE_BITS,
  CITY_ICON_SCALE_FADE_WIDTH,
  CITY_ICON_SHAPE_IDS,
  CITY_ICON_TIER_SCALES,
  CITY_ICON_VERTEX_SHADER_SOURCE,
  CityIconWebglLayer,
  cityIconCameraSizeFactor,
  cityIconCssSize,
  cityIconMaxSizeFactor,
  cityIconOutlineCssLimit,
  cityIconOutlineExtent,
  cityIconRoleBits,
  cityIconScaleVisibility,
  createCityIconWebglLayer,
  packCityIconInstances
} from "../app/webgl-generator/src/renderer/city-icon-layer.js";

const source = await readFile(new URL("../app/webgl-generator/src/renderer/city-icon-layer.js", import.meta.url), "utf8");
const shapeKeys = ["hamlet", "village", "town", "city", "capital", "provincial", "port", "fort", "camp"];

assert.deepEqual(Object.keys(CITY_ICON_SHAPE_IDS), shapeKeys, "WebGL 城镇层的九种图形分母漂移");
assert.equal(new Set(Object.values(CITY_ICON_SHAPE_IDS)).size, 9, "WebGL 城镇图形 id 必须各自唯一");
assert.deepEqual(Object.keys(CITY_ICON_TIER_SCALES), ["hamlet", "village", "town", "city"], "人口四级尺寸分母漂移");
assert.deepEqual(CITY_ICON_ROLE_BITS, {capital: 1, provincial: 2, port: 4}, "附加角色 bit 契约漂移");
assert.equal(cityIconRoleBits(["capital", "provincial", "port"]), 7, "多角色 bit 不能稳定组合");
assert.deepEqual(CITY_ICON_BASE_CSS_SIZE, {width: 12.5, height: 9.5}, "城镇图标基准盒漂移");
assert.equal(Math.round(CITY_ICON_BASE_CSS_SIZE.width / 10.5 * 1000) / 1000, 1.19, "城镇图标宽度没有保持约 19% 的小幅放大");
assert.equal(Math.round(CITY_ICON_BASE_CSS_SIZE.height / 8 * 1000) / 1000, 1.188, "城镇图标高度没有保持约 19% 的小幅放大");
assert(Math.abs(cityIconOutlineCssLimit(22.1) - 10.05) < 0.001, "短名称上限没有校准到名称约半宽");
assert.equal(cityIconOutlineCssLimit(8), 4.8, "极短名称没有使用最小可辨轮廓上限");
assert.equal(cityIconOutlineCssLimit(80), 10.5, "长名称没有使用最大轮廓上限");
assert(CITY_ICON_SCALE_FADE_WIDTH > 0, "缩放阈值必须有非零平滑带");
assert.equal(CITY_ICON_INSTANCE_FLOATS, 11, "实例属性分母必须覆盖名称宽度上限");
assert.equal(CITY_ICON_INSTANCE_STRIDE_BYTES, 44, "实例 stride 必须与 11 个 float 一致");
const packedInstance = packCityIconInstances([{id: 7, x: 10, y: 20, silhouette: "capital", scale: "city", roles: ["port"], maxSizeFactor: 0.625}], {nowMs: 90});
assert.equal(packedInstance.data.length, 11, "单实例 buffer 长度不是 11 floats");
assert.equal(packedInstance.data[10], 0.625, "名称宽度上限没有写入实例 offset 10");

const scales = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12];
const factors = scales.map(cityIconCameraSizeFactor);
for (let index = 1; index < factors.length; index++) {
  assert(factors[index] > factors[index - 1], `连续尺寸函数在 ${scales[index - 1]}→${scales[index]} 未严格增长`);
}
assert(factors.at(-1) < 3, "12× 图标尺寸增长失控");
assert(factors[6] / factors[2] > 1.8, "1×→4× 图标变化仍不明显");
for (const tier of Object.keys(CITY_ICON_TIER_SCALES)) {
  const sizes = scales.map(scale => cityIconCssSize(scale, tier));
  assert(sizes.every(size => size.width > 0 && size.height > 0), `${tier} 出现非正尺寸`);
  assert(sizes.at(-1).width > sizes[0].width, `${tier} 没有随相机连续放大`);
}

const nameWidthCases = [
  {silhouette: "city", roles: [], tier: "city", nameWidthCss: 22.1},
  {silhouette: "capital", roles: ["capital"], tier: "city", nameWidthCss: 25.1},
  {silhouette: "town", roles: ["port"], tier: "town", nameWidthCss: 11}
];
for (const sample of nameWidthCases) {
  const maxSizeFactor = cityIconMaxSizeFactor(sample);
  const outlineLimit = cityIconOutlineCssLimit(sample.nameWidthCss);
  const extent = cityIconOutlineExtent(sample.silhouette, sample.roles);
  const outlineWidths = scales.map(scale => {
    const size = cityIconCssSize(scale, sample.tier, CITY_ICON_BASE_CSS_SIZE, maxSizeFactor);
    return extent * CITY_ICON_BASE_CSS_SIZE.height * size.factor + CITY_ICON_OUTLINE_STROKE_CSS_PX;
  });
  assert(outlineWidths.every(width => width <= outlineLimit + 0.001), `${sample.silhouette} 超过名称驱动的轮廓上限`);
  assert(outlineWidths.at(-1) <= sample.nameWidthCss * 0.5, `${sample.silhouette} 高倍缩放后没有保持约半个名称宽度`);
}

const minScale = 2;
const visibilitySamples = [1.7, 1.8, 1.9, 2, 2.1, 2.2, 2.3].map(scale => cityIconScaleVisibility(scale, minScale));
for (let index = 1; index < visibilitySamples.length; index++) {
  assert(visibilitySamples[index] >= visibilitySamples[index - 1], "minScale smoothstep 不单调");
}
assert.equal(visibilitySamples[0], 0, "平滑带下方未完全隐藏");
assert.equal(visibilitySamples.at(-1), 1, "平滑带上方未完全显示");
assert(visibilitySamples[3] > 0 && visibilitySamples[3] < 1, "阈值中心仍是硬切换");

assert.equal(typeof CityIconWebglLayer, "function");
assert.equal(typeof createCityIconWebglLayer, "function");
assert.match(CITY_ICON_VERTEX_SHADER_SOURCE, /cameraSizeFactor\(u_cameraScale\)/, "vertex shader 未直接使用当前相机连续尺寸");
assert.match(CITY_ICON_VERTEX_SHADER_SOURCE, /min\(cameraSizeFactor\(u_cameraScale\) \* a_tierScale, a_maxSizeFactor\)/, "vertex shader 未使用名称宽度实例上限");
assert.match(CITY_ICON_VERTEX_SHADER_SOURCE, /centerNdc \* u_cameraScale \+ u_cameraOffset/, "实例中心未与当前相机同帧变换");
assert.match(CITY_ICON_FRAGMENT_SHADER_SOURCE, /mainShapeDistance/, "fragment shader 缺少解析式主体图形");
for (const shapeId of Object.values(CITY_ICON_SHAPE_IDS)) {
  assert(CITY_ICON_FRAGMENT_SHADER_SOURCE.includes(`shape == ${shapeId}`) || shapeId === CITY_ICON_SHAPE_IDS.camp, `shader 缺少 shape ${shapeId}`);
}
assert.match(CITY_ICON_FRAGMENT_SHADER_SOURCE, /polygonOutlineDistance\(p, 10,[^\n]+0\.38\)/, "首都未使用五角星轮廓");
assert.match(CITY_ICON_FRAGMENT_SHADER_SOURCE, /portOutlineDistance/, "港口未使用断口马蹄轮廓");
assert.match(CITY_ICON_FRAGMENT_SHADER_SOURCE, /min\(abs\(length\(p\) - 0\.8\), abs\(length\(p\) - 0\.44\)\)/, "大城未使用双环");
assert.equal(CITY_ICON_OUTLINE_STROKE_CSS_PX, 2, "名称上限与着色器外描边宽度漂移");
assert.match(CITY_ICON_FRAGMENT_SHADER_SOURCE, /fwidth\(distancePx\) \* 0\.5/, "解析式线条没有收紧导数抗锯齿带");
assert.match(CITY_ICON_FRAGMENT_SHADER_SOURCE, /0\.22 \/ max\(u_pixelRatio, 1\.0\)/, "解析式线条缺少 DPR 感知抗锯齿下限");
assert.match(CITY_ICON_FRAGMENT_SHADER_SOURCE, /smoothstep\(1\.0 - antialiasWidth, 1\.0 \+ antialiasWidth, distancePx\)/, "深色外沿没有使用新对称阈值");
assert.match(CITY_ICON_FRAGMENT_SHADER_SOURCE, /smoothstep\(0\.5 - antialiasWidth, 0\.5 \+ antialiasWidth, distancePx\)/, "白色线芯没有同步校准");
assert.match(CITY_ICON_FRAGMENT_SHADER_SOURCE, /u_darkOutline/, "图标缺少深色硬外轮廓");
assert.match(CITY_ICON_FRAGMENT_SHADER_SOURCE, /u_whiteInner/, "图标缺少纯白内线");
assert.match(CITY_ICON_FRAGMENT_SHADER_SOURCE, /u_selectedInner/, "选中态没有独立金线");
assert.match(CITY_ICON_FRAGMENT_SHADER_SOURCE, /smoothstep\(v_minScale - u_scaleFadeWidth, v_minScale \+ u_scaleFadeWidth, u_cameraScale\)/, "minScale 没有在 shader 内平滑显隐");
assert.match(CITY_ICON_FRAGMENT_SHADER_SOURCE, /mix\(v_visibilityFrom, v_visibilityTarget, transitionProgress\)/, "visibility target 仍会硬切换");
assert.match(CITY_ICON_FRAGMENT_SHADER_SOURCE, /roleShapeDistance/, "多角色附加小符号没有进入解析式距离场");
assert.doesNotMatch(source, /shadow|drop-shadow|filter:|offsetShadow/, "WebGL 城镇图标层不得引入阴影、滤镜或偏移投影");
assert.doesNotMatch(source, /sampler2D|texImage2D|createTexture|<svg|createElement/, "正式城镇图标层不得回退纹理、SVG 或 DOM 图标");

assert.match(source, /gl\.drawArraysInstanced\(gl\.TRIANGLES, 0, 6, this\.instances\.length\)/, "城镇实例没有收口为单次 drawArraysInstanced");
assert.match(source, /vertexAttribDivisor\(location, 1\)/, "实例属性没有设置 divisor");
assert.match(source, /location <= 10/, "实例 VAO 没有绑定 location 10");
assert.match(source, /data\[offset \+ 10\] = item\.maxSizeFactor/, "实例 offset 10 没有写入 GPU 尺寸上限");
const drawMethod = source.match(/  draw\(\{mapSize,[\s\S]*?\n  snapshot\(\)/)?.[0] || "";
assert(drawMethod, "无法定位 WebGL 城镇层 draw 方法");
assert.doesNotMatch(drawMethod, /bufferData|bufferSubData|setInstances|updateInstanceStates/, "普通相机 draw 帧仍会重建或上传实例 buffer");
assert.match(source, /setInstances[\s\S]*gl\.bufferData/, "模型变化没有完整实例上传入口");
assert.match(source, /updateInstanceStates[\s\S]*uploadChangedInstanceRanges/, "visibility/selection 变化没有局部上传入口");

console.log(JSON.stringify({
  cityWebglShapes: shapeKeys.length,
  roleBits: CITY_ICON_ROLE_BITS,
  sizeFactors: Object.fromEntries(scales.map((scale, index) => [scale, Math.round(factors[index] * 1000) / 1000])),
  visibilitySamples,
  instancedDrawCallsPerFrame: 1,
  cameraFrameInstanceUploads: 0,
  colors: {outer: "dark-hard-outline", inner: "white", selected: "gold"}
}, null, 2));
