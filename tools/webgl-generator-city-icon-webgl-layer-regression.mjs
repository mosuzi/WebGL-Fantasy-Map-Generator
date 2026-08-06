import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  CITY_ICON_BASE_CSS_SIZE,
  CITY_ICON_CAPITAL_ROLE_SCALE,
  CITY_ICON_OUTLINE_STROKE_CSS_PX,
  CITY_ICON_FRAGMENT_SHADER_SOURCE,
  CITY_ICON_INSTANCE_FLOATS,
  CITY_ICON_INSTANCE_STRIDE_BYTES,
  CITY_ICON_MAX_OUTLINE_CSS_PX,
  CITY_ICON_MIN_OUTLINE_CSS_PX,
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
  cityIconRoleScale,
  cityIconScaleVisibility,
  cityIconSizeFactor,
  createCityIconWebglLayer,
  packCityIconInstances
} from "../app/webgl-generator/src/renderer/city-icon-layer.js";

const source = await readFile(new URL("../app/webgl-generator/src/renderer/city-icon-layer.js", import.meta.url), "utf8");
const shapeKeys = ["hamlet", "village", "town", "city", "capital", "provincial", "port", "fort", "camp"];

assert.deepEqual(Object.keys(CITY_ICON_SHAPE_IDS), shapeKeys, "WebGL 城镇层的九种图形分母漂移");
assert.equal(new Set(Object.values(CITY_ICON_SHAPE_IDS)).size, 9, "WebGL 城镇图形 id 必须各自唯一");
assert.deepEqual(Object.keys(CITY_ICON_TIER_SCALES), ["hamlet", "village", "town", "city"], "人口四级尺寸分母漂移");
assert.deepEqual(CITY_ICON_TIER_SCALES, {hamlet: 0.72, village: 0.86, town: 1.02, city: 1.2}, "人口四级尺寸差异漂移");
assert.equal(CITY_ICON_CAPITAL_ROLE_SCALE, 1.25, "首都角色尺寸倍率漂移");
assert.equal(cityIconRoleScale(["capital"]), 1.25, "首都原始角色没有进入尺寸倍率");
assert.equal(cityIconRoleScale(["provincial", "port"]), 1, "省会或港口不应改变人口级别尺寸");
assert.deepEqual(CITY_ICON_ROLE_BITS, {capital: 1, provincial: 2, port: 4}, "附加角色 bit 契约漂移");
assert.equal(cityIconRoleBits(["capital", "provincial", "port"]), 7, "多角色 bit 不能稳定组合");
assert.deepEqual(CITY_ICON_BASE_CSS_SIZE, {width: 12.5, height: 9.5}, "城镇图标基准盒漂移");
assert.equal(Math.round(CITY_ICON_BASE_CSS_SIZE.width / 10.5 * 1000) / 1000, 1.19, "城镇图标宽度没有保持约 19% 的小幅放大");
assert.equal(Math.round(CITY_ICON_BASE_CSS_SIZE.height / 8 * 1000) / 1000, 1.188, "城镇图标高度没有保持约 19% 的小幅放大");
assert.equal(CITY_ICON_MIN_OUTLINE_CSS_PX, 5.4, "最小轮廓上限漂移");
assert.equal(CITY_ICON_MAX_OUTLINE_CSS_PX, 12.1, "最大轮廓上限漂移");
assert(Math.abs(cityIconOutlineCssLimit(22.1) - 11.7075) < 0.001, "名称宽度系数没有校准到 0.575");
assert.equal(cityIconOutlineCssLimit(8), 5.4, "极短名称没有使用最小可辨轮廓上限");
assert.equal(cityIconOutlineCssLimit(80), 12.1, "长名称没有使用最大轮廓上限");
assert(CITY_ICON_SCALE_FADE_WIDTH > 0, "缩放阈值必须有非零平滑带");
assert.equal(CITY_ICON_INSTANCE_FLOATS, 11, "实例属性分母必须覆盖名称宽度上限");
assert.equal(CITY_ICON_INSTANCE_STRIDE_BYTES, 44, "实例 stride 必须与 11 个 float 一致");
const packedInstance = packCityIconInstances([{id: 7, x: 10, y: 20, silhouette: "capital", scale: "city", roles: ["port"], maxSizeFactor: 0.625}], {nowMs: 90});
assert.equal(packedInstance.data.length, 11, "单实例 buffer 长度不是 11 floats");
assert(Math.abs(packedInstance.data[3] - CITY_ICON_TIER_SCALES.city) < 1e-6, "港口或五角星剪影误触发首都尺寸倍率");
assert.equal(packedInstance.data[10], 0.625, "名称宽度上限没有写入实例 offset 10");
const packedCapital = packCityIconInstances([{id: 8, x: 10, y: 20, silhouette: "capital", scale: "city", roles: ["capital"]}], {nowMs: 90});
const packedManualStar = packCityIconInstances([{id: 9, x: 10, y: 20, silhouette: "capital", scale: "city", roles: []}], {nowMs: 90});
const packedManualCapital = packCityIconInstances([{id: 10, x: 10, y: 20, silhouette: "fort", scale: "city", roles: ["capital"]}], {nowMs: 90});
assert(Math.abs(packedCapital.data[3] - CITY_ICON_TIER_SCALES.city * 1.25) < 1e-6, "GPU 首都 tierScale 没有只烘入一次 1.25");
assert(Math.abs(packedManualStar.data[3] - CITY_ICON_TIER_SCALES.city) < 1e-6, "无 capital 角色的手工五角星被误放大");
assert(Math.abs(packedManualCapital.data[3] - CITY_ICON_TIER_SCALES.city * 1.25) < 1e-6, "保留其它剪影的手工首都没有放大");

const scales = [1, 1.5, 2, 2.5, 3, 4, 12];
const factors = scales.map(cityIconCameraSizeFactor);
for (let index = 1; index < factors.length; index++) {
  assert(factors[index] > factors[index - 1], `连续尺寸函数在 ${scales[index - 1]}→${scales[index]} 未严格增长`);
}
assert(factors.at(-1) < 3, "12× 图标尺寸增长失控");
assert(factors[5] / factors[0] > 1.8, "1×→4× 图标变化仍不明显");
for (const tier of Object.keys(CITY_ICON_TIER_SCALES)) {
  const sizes = scales.map(scale => cityIconCssSize(scale, tier));
  assert(sizes.every(size => size.width > 0 && size.height > 0), `${tier} 出现非正尺寸`);
  assert(sizes.at(-1).width > sizes[0].width, `${tier} 没有随相机连续放大`);
}
const tierAssertionScales = [1, 1.5, 2.5, 4];
const realFiniteCap = cityIconMaxSizeFactor({silhouette: "town", nameWidthCss: 22.1});
for (const scale of tierAssertionScales) {
  assertTierProgression(scalesFor(scale), `${scale}× 自然尺寸`);
  assertTierProgression(scalesFor(scale, realFiniteCap), `${scale}× 名称封顶尺寸`);
}
for (const maxSizeFactor of [Number.POSITIVE_INFINITY, realFiniteCap]) {
  for (const scale of tierAssertionScales) {
    for (const tier of Object.keys(CITY_ICON_TIER_SCALES)) {
      const ordinary = cityIconSizeFactor(scale, tier, maxSizeFactor);
      const capital = cityIconSizeFactor(scale, tier, maxSizeFactor, ["capital"]);
      assert.equal(ordinary, cityIconSizeFactor(scale, tier, maxSizeFactor, ["provincial", "port"]), `${scale}× / ${tier} 非首都角色改变了尺寸`);
      assert(Math.abs(capital / ordinary - CITY_ICON_CAPITAL_ROLE_SCALE) < 1e-12, `${scale}× / ${tier} 首都不是线性 1.25：${capital / ordinary}`);
      assert(Math.abs(capital / ordinary - CITY_ICON_CAPITAL_ROLE_SCALE ** 2) > 0.1, `${scale}× / ${tier} 首都误乘为 R²`);
    }
  }
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
    const size = cityIconCssSize(scale, sample.tier, CITY_ICON_BASE_CSS_SIZE, maxSizeFactor, sample.roles);
    return extent * CITY_ICON_BASE_CSS_SIZE.height * size.factor + CITY_ICON_OUTLINE_STROKE_CSS_PX;
  });
  const roleScale = cityIconRoleScale(sample.roles);
  const roleAdjustedLimit = (outlineLimit - CITY_ICON_OUTLINE_STROKE_CSS_PX) * roleScale + CITY_ICON_OUTLINE_STROKE_CSS_PX;
  assert(outlineWidths.every(width => width <= roleAdjustedLimit + 0.001), `${sample.silhouette} 超过角色调整后的名称轮廓上限`);
}

const previousTierScales = {hamlet: 0.62, village: 0.76, town: 0.92, city: 1.1};
const baselineGrowthRatios = [];
for (const nameWidthCss of [8, 22.1, 80]) {
  const sample = {silhouette: "town", nameWidthCss};
  const currentCap = cityIconMaxSizeFactor(sample);
  const previousCap = previousCityIconMaxSizeFactor(sample);
  for (const scale of [...tierAssertionScales, 12]) {
    for (const tier of Object.keys(CITY_ICON_TIER_SCALES)) {
      const current = cityIconCssSize(scale, tier, CITY_ICON_BASE_CSS_SIZE, currentCap);
      const previousFactor = Math.min(cityIconCameraSizeFactor(scale), previousCap / previousTierScales.city) * previousTierScales[tier];
      const previousWidth = CITY_ICON_BASE_CSS_SIZE.width * previousFactor;
      assert(current.width > previousWidth + 0.001, `${nameWidthCss}px 名称 / ${scale}× / ${tier} 没有大于第294项同名封顶基线`);
      baselineGrowthRatios.push(current.width / previousWidth);
    }
  }
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
assert.match(CITY_ICON_VERTEX_SHADER_SOURCE, /min\(cameraSizeFactor\(u_cameraScale\), a_maxSizeFactor \/ 1\.20\) \* a_tierScale/, "vertex shader 未先封顶相机尺寸再应用人口级别");
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
assert.match(source, /tierScale: baseTierScale \* cityIconRoleScale\(item\.roles\)/, "GPU 实例没有从原始 roles 烘入首都倍率");
assert.doesNotMatch(source.match(/function cityIconRoleScale[\s\S]*?\n}/)?.[0] || "", /additionalRoleBits|shape/, "首都倍率不得从附加角色 bit 或剪影推断");
const drawMethod = source.match(/  draw\(\{mapSize,[\s\S]*?\n  snapshot\(\)/)?.[0] || "";
assert(drawMethod, "无法定位 WebGL 城镇层 draw 方法");
assert.doesNotMatch(drawMethod, /bufferData|bufferSubData|setInstances|updateInstanceStates/, "普通相机 draw 帧仍会重建或上传实例 buffer");
assert.match(source, /setInstances[\s\S]*gl\.bufferData/, "模型变化没有完整实例上传入口");
assert.match(source, /updateInstanceStates[\s\S]*uploadChangedInstanceRanges/, "visibility/selection 变化没有局部上传入口");

function scalesFor(scale, maxSizeFactor = Number.POSITIVE_INFINITY) {
  return Object.keys(CITY_ICON_TIER_SCALES).map(tier => cityIconSizeFactor(scale, tier, maxSizeFactor));
}

function assertTierProgression(values, label) {
  for (let index = 1; index < values.length; index++) {
    assert(values[index] > values[index - 1], `${label}四级没有严格递增：${values.join(", ")}`);
    assert(values[index] / values[index - 1] >= 1.15, `${label}相邻级差不足 15%：${values.join(", ")}`);
  }
  assert(values.at(-1) / values[0] >= 1.55, `${label}城市与村落级差不足 55%：${values.join(", ")}`);
}

function previousCityIconMaxSizeFactor({silhouette, roles = [], nameWidthCss}) {
  const width = Number(nameWidthCss);
  const outlineLimit = Number.isFinite(width) ? Math.max(4.8, Math.min(10.5, width * 0.5 - 1)) : 10.5;
  const extent = cityIconOutlineExtent(silhouette, roles);
  return Math.max(1, outlineLimit - CITY_ICON_OUTLINE_STROKE_CSS_PX) / (CITY_ICON_BASE_CSS_SIZE.height * extent);
}

console.log(JSON.stringify({
  cityWebglShapes: shapeKeys.length,
  roleBits: CITY_ICON_ROLE_BITS,
  capitalRoleScale: CITY_ICON_CAPITAL_ROLE_SCALE,
  sizeFactors: Object.fromEntries(scales.map((scale, index) => [scale, Math.round(factors[index] * 1000) / 1000])),
  tierScales: CITY_ICON_TIER_SCALES,
  realFiniteCap: Math.round(realFiniteCap * 1000) / 1000,
  minimumGrowthOverTask294: Math.round(Math.min(...baselineGrowthRatios) * 1000) / 1000,
  visibilitySamples,
  instancedDrawCallsPerFrame: 1,
  cameraFrameInstanceUploads: 0,
  colors: {outer: "dark-hard-outline", inner: "white", selected: "gold"}
}, null, 2));
