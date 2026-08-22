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
import {PlaceholderMapRenderer} from "../app/webgl-generator/src/renderer/placeholder-renderer.js";
import {adoptOverlayLabelResourceBinding} from "../app/webgl-generator/src/renderer/retained-render-resource-binding.js";
import {
  adoptRenderCacheResourceBinding,
  RENDER_CACHE_RESOURCE_FAMILIES
} from "../app/webgl-generator/src/renderer/render-cache-resource-binding.js";

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

class FakeGl {
  constructor() {
    Object.assign(this, {
      ARRAY_BUFFER: 0x8892,
      ARRAY_BUFFER_BINDING: 0x8894,
      BLEND: 0x0be2,
      BLEND_DST_ALPHA: 0x80ca,
      BLEND_DST_RGB: 0x80c8,
      BLEND_SRC_ALPHA: 0x80cb,
      BLEND_SRC_RGB: 0x80c9,
      COLOR_BUFFER_BIT: 0x4000,
      CURRENT_PROGRAM: 0x8b8d,
      DEPTH_BUFFER_BIT: 0x0100,
      DEPTH_TEST: 0x0b71,
      DEPTH_WRITEMASK: 0x0b72,
      FLOAT: 0x1406,
      GREATER: 0x0204,
      LESS: 0x0201,
      LINES: 0x0001,
      ONE: 1,
      ONE_MINUS_SRC_ALPHA: 0x0303,
      POINTS: 0x0000,
      SRC_ALPHA: 0x0302,
      TRIANGLES: 0x0004,
      VERTEX_ARRAY_BINDING: 0x85b5,
      ZERO: 0,
      INVALID_OPERATION: 0x0502
    });
    this.calls = [];
    this.queryCounts = {getParameter: 0, isEnabled: 0};
    this.state = {
      program: null,
      vertexArray: null,
      arrayBuffer: null,
      blend: false,
      depthTest: false,
      depthWrite: false,
      blendSrcRgb: this.SRC_ALPHA,
      blendDstRgb: this.ONE_MINUS_SRC_ALPHA,
      blendSrcAlpha: this.SRC_ALPHA,
      blendDstAlpha: this.ONE_MINUS_SRC_ALPHA
    };
    this.nextError = 0;
  }

  resetCalls() {
    this.calls.length = 0;
    this.queryCounts = {getParameter: 0, isEnabled: 0};
  }

  snapshotState() {
    return {...this.state};
  }

  record(name, ...args) {
    this.calls.push({name, args});
  }

  bindBuffer(target, buffer) {
    this.record("bindBuffer", target, buffer);
    if (target === this.ARRAY_BUFFER) this.state.arrayBuffer = buffer;
  }

  bindVertexArray(vertexArray) {
    this.record("bindVertexArray", vertexArray);
    this.state.vertexArray = vertexArray;
  }

  blendFunc(src, dst) {
    this.record("blendFunc", src, dst);
    this.state.blendSrcRgb = src;
    this.state.blendDstRgb = dst;
    this.state.blendSrcAlpha = src;
    this.state.blendDstAlpha = dst;
  }

  blendFuncSeparate(srcRgb, dstRgb, srcAlpha, dstAlpha) {
    this.record("blendFuncSeparate", srcRgb, dstRgb, srcAlpha, dstAlpha);
    this.state.blendSrcRgb = srcRgb;
    this.state.blendDstRgb = dstRgb;
    this.state.blendSrcAlpha = srcAlpha;
    this.state.blendDstAlpha = dstAlpha;
  }

  depthMask(value) {
    this.record("depthMask", value);
    this.state.depthWrite = Boolean(value);
  }

  disable(capability) {
    this.record("disable", capability);
    if (capability === this.BLEND) this.state.blend = false;
    if (capability === this.DEPTH_TEST) this.state.depthTest = false;
  }

  enable(capability) {
    this.record("enable", capability);
    if (capability === this.BLEND) this.state.blend = true;
    if (capability === this.DEPTH_TEST) this.state.depthTest = true;
  }

  getError() {
    this.record("getError");
    const value = this.nextError;
    this.nextError = 0;
    return value;
  }

  getParameter(parameter) {
    this.record("getParameter", parameter);
    this.queryCounts.getParameter++;
    if (parameter === this.CURRENT_PROGRAM) return this.state.program;
    if (parameter === this.VERTEX_ARRAY_BINDING) return this.state.vertexArray;
    if (parameter === this.ARRAY_BUFFER_BINDING) return this.state.arrayBuffer;
    if (parameter === this.DEPTH_WRITEMASK) return this.state.depthWrite;
    if (parameter === this.BLEND_SRC_RGB) return this.state.blendSrcRgb;
    if (parameter === this.BLEND_DST_RGB) return this.state.blendDstRgb;
    if (parameter === this.BLEND_SRC_ALPHA) return this.state.blendSrcAlpha;
    if (parameter === this.BLEND_DST_ALPHA) return this.state.blendDstAlpha;
    throw new Error(`FakeGl 未实现 getParameter(${parameter})`);
  }

  isEnabled(capability) {
    this.record("isEnabled", capability);
    this.queryCounts.isEnabled++;
    if (capability === this.BLEND) return this.state.blend;
    if (capability === this.DEPTH_TEST) return this.state.depthTest;
    throw new Error(`FakeGl 未实现 isEnabled(${capability})`);
  }

  useProgram(program) {
    this.record("useProgram", program);
    this.state.program = program;
  }

  clear(...args) { this.record("clear", ...args); }
  clearColor(...args) { this.record("clearColor", ...args); }
  clearDepth(...args) { this.record("clearDepth", ...args); }
  depthFunc(...args) { this.record("depthFunc", ...args); }
  drawArrays(...args) { this.record("drawArrays", ...args); }
  drawArraysInstanced(...args) { this.record("drawArraysInstanced", ...args); }
  enableVertexAttribArray(...args) { this.record("enableVertexAttribArray", ...args); }
  lineWidth(...args) { this.record("lineWidth", ...args); }
  uniform1f(...args) { this.record("uniform1f", ...args); }
  uniform1i(...args) { this.record("uniform1i", ...args); }
  uniform2f(...args) { this.record("uniform2f", ...args); }
  uniform4fv(...args) { this.record("uniform4fv", ...args); }
  vertexAttribPointer(...args) { this.record("vertexAttribPointer", ...args); }
  viewport(...args) { this.record("viewport", ...args); }
}

function createLayerHarness(gl, instanceCount = 1) {
  const layer = Object.create(CityIconWebglLayer.prototype);
  Object.assign(layer, {
    gl,
    baseSize: {...CITY_ICON_BASE_CSS_SIZE},
    transitionMs: 150,
    scaleFadeWidth: CITY_ICON_SCALE_FADE_WIDTH,
    program: {name: "city-program"},
    vao: {name: "city-vao"},
    instances: Array.from({length: instanceCount}, (_, id) => ({id})),
    stats: {
      instanceCount,
      modelUploads: 0,
      stateUploads: 0,
      uploadedBytes: 0,
      drawCalls: 0,
      lastDrawInstances: 0,
      uniformOnlyCameraFrames: 0
    },
    locations: Object.fromEntries([
      "mapSize", "viewportBacking", "pixelRatio", "baseSizeCss", "cameraScale", "cameraOffset", "timeMs",
      "transitionMs", "scaleFadeWidth", "darkOutline", "whiteInner", "selectedInner"
    ].map((name, index) => [name, index]))
  });
  return layer;
}

function drawOptions(overrides = {}) {
  return {
    mapSize: {width: 100, height: 80},
    camera: {scale: 2, offsetX: 0.1, offsetY: -0.2},
    canvas: {width: 800, height: 600, clientWidth: 400, clientHeight: 300},
    timeMs: 120,
    ...overrides
  };
}

function testStandaloneStateContract() {
  const gl = new FakeGl();
  const layer = createLayerHarness(gl);
  Object.assign(gl.state, {
    program: {name: "previous-program"},
    vertexArray: {name: "previous-vao"},
    arrayBuffer: {name: "previous-buffer"},
    blend: true,
    depthTest: true,
    depthWrite: true,
    blendSrcRgb: gl.ONE,
    blendDstRgb: gl.ZERO,
    blendSrcAlpha: gl.ZERO,
    blendDstAlpha: gl.ONE
  });
  const before = gl.snapshotState();
  gl.resetCalls();
  assert.equal(layer.draw(drawOptions()), 1, "独立城镇层默认 draw 未绘制实例");
  assert.deepEqual(gl.snapshotState(), before, "独立城镇层默认 draw 未恢复任意 GL 状态");
  assert.equal(gl.queryCounts.getParameter, 8, "独立默认恢复的 getParameter 分母漂移");
  assert.equal(gl.queryCounts.isEnabled, 2, "独立默认恢复的 isEnabled 分母漂移");
  assert.equal(gl.calls.filter(call => call.name === "drawArraysInstanced").length, 1, "独立默认 draw 未保持单次 instanced draw");

  const optOut = createLayerHarness(gl);
  gl.resetCalls();
  assert.equal(optOut.draw(drawOptions({restoreState: false})), 1);
  assert.equal(optOut.draw(drawOptions({restoreState: false, timeMs: 140})), 1);
  assert.deepEqual(gl.queryCounts, {getParameter: 0, isEnabled: 0}, "restoreState:false 仍同步查询 GL 状态");
  assert.equal(gl.calls.filter(call => call.name === "drawArraysInstanced").length, 2, "重复帧不是每帧一次 instanced draw");
  assert.deepEqual(optOut.snapshot(), {
    instanceCount: 1,
    modelUploads: 0,
    stateUploads: 0,
    uploadedBytes: 0,
    drawCalls: 2,
    lastDrawInstances: 1,
    uniformOnlyCameraFrames: 2
  }, "重复帧 stats 漂移");
  const liveLayoutCanvas = {
    get width() { throw new Error("不得读取 live canvas.width"); },
    get height() { throw new Error("不得读取 live canvas.height"); },
    get clientWidth() { throw new Error("不得读取 live canvas.clientWidth"); },
    get clientHeight() { throw new Error("不得读取 live canvas.clientHeight"); }
  };
  assert.equal(optOut.draw(drawOptions({
    canvas: liveLayoutCanvas,
    canvasSize: {width: 800, height: 600, cssWidth: 400, cssHeight: 300, pixelRatio: 2},
    restoreState: false
  })), 1, "缓存 canvas size 未能独立驱动城镇 preview draw");
  const beforeHidden = optOut.snapshot();
  const hiddenCallCount = gl.calls.length;
  assert.equal(optOut.draw(drawOptions({layerVisible: false, restoreState: false})), 0);
  assert.equal(gl.calls.length, hiddenCallCount, "隐藏城镇层仍调用 GL");
  assert.equal(optOut.stats.drawCalls, beforeHidden.drawCalls, "隐藏帧误增 drawCalls");
  assert.equal(optOut.stats.uniformOnlyCameraFrames, beforeHidden.uniformOnlyCameraFrames, "隐藏帧误增 uniformOnlyCameraFrames");
  assert.equal(optOut.stats.lastDrawInstances, 0, "隐藏帧未清 lastDrawInstances");

  const empty = createLayerHarness(gl, 0);
  gl.resetCalls();
  assert.equal(empty.draw(drawOptions({restoreState: false})), 0);
  assert.deepEqual(gl.calls, [], "零实例帧仍调用 GL");
  assert.equal(empty.stats.drawCalls, 0, "零实例帧误增 drawCalls");
  assert.equal(empty.stats.uniformOnlyCameraFrames, 0, "零实例帧误增 uniformOnlyCameraFrames");
}

function testPlaceholderDrawTailState() {
  const gl = new FakeGl();
  const cityIconLayer = createLayerHarness(gl);
  const buffer = name => ({name});
  const mainProgram = {name: "main-program"};
  const pointBuffer = buffer("point-buffer");
  const camera = {scale: 1, offsetX: 0, offsetY: 0};
  const renderer = Object.assign(Object.create(PlaceholderMapRenderer.prototype), {
    canvas: {width: 800, height: 600, clientWidth: 800, clientHeight: 600},
    canvasSize: {width: 800, height: 600, cssWidth: 800, cssHeight: 600, pixelRatio: 1},
    gl,
    webGlContextLost: false,
    webGlContextResourceState: "ready",
    retainedResourcePublishSuspended: 0,
    retainedResourceState: "ready",
    map: {metadata: {width: 100, height: 80, graphWidth: 100, graphHeight: 80}, layers: {background: [0, 0, 0, 1]}},
    surfaceResourceOwner: Object.freeze({
      mapIdentity: "city-icon-integration",
      mapRevision: 0,
      sourceRevision: 0,
      topologyRevision: 0,
      renderPreparationId: "city-icon-integration",
      renderGeneration: 0,
      surfaceFloatLength: 18,
      correctionWordLength: 0
    }),
    visualTheme: {canvas: {background: [0, 0, 0, 1]}},
    camera,
    program: mainProgram,
    locations: {position: 0, color: 1, scale: 2, offset: 3, pointMode: 4, surfaceSideMode: 5},
    workerRenderInstallSuspended: 0,
    dynamicBuffersDirty: {routes: false, tradeFlows: false, rivers: false, selection: false},
    layerVisibility: {routes: false, tradeFlows: false, rivers: false, gridCells: false, cities: true},
    surfaceBaseBufferSet: null,
    surfaceVertices: new Float32Array(18),
    vertexBuffer: buffer("surface-buffer"),
    vertexCount: 3,
    surfacePatchBuffer: buffer("surface-patch-buffer"),
    surfacePatchVertexCount: 0,
    landCorrectionBuffer: buffer("land-correction-buffer"),
    landCorrectionVertexCount: 0,
    waterCorrectionBuffer: buffer("water-correction-buffer"),
    waterCorrectionVertexCount: 0,
    landCoverBuffer: buffer("land-cover-buffer"),
    landCoverVertexCount: 0,
    waterCoverBuffer: buffer("water-cover-buffer"),
    waterCoverVertexCount: 0,
    oceanCurrentBuffer: buffer("ocean-current-buffer"),
    oceanCurrentVertexCount: 0,
    heightCellSelectionBuffer: buffer("height-selection-buffer"),
    heightCellSelectionVertexCount: 0,
    heightTransformPreviewBuffer: buffer("height-preview-buffer"),
    heightTransformPreviewVertexCount: 0,
    politicalMeshDebugBuffer: buffer("political-debug-buffer"),
    politicalMeshDebugVertexCount: 0,
    routeBuffer: buffer("route-buffer"),
    routeBufferCamera: camera,
    routeDrawRanges: [],
    routeVertexCount: 0,
    tradeFlowBuffer: buffer("trade-flow-buffer"),
    tradeFlowVertexCount: 0,
    lineBuffer: buffer("line-buffer"),
    lineVertexCount: 0,
    shoreLineBuffer: buffer("shore-line-buffer"),
    shoreLineVertexCount: 0,
    riverBuffer: buffer("river-buffer"),
    riverBufferCamera: camera,
    riverVertexCount: 0,
    gridCellDiagnostics: {ready: false},
    gridCellDiagnosticsBuffer: buffer("grid-buffer"),
    gridCellDiagnosticsVertexCount: 0,
    gridCellDiagnosticFillBuffer: buffer("grid-fill-buffer"),
    gridCellDiagnosticFillVertexCount: 0,
    gridCellDiagnosticLineBuffer: buffer("grid-line-buffer"),
    gridCellDiagnosticLineVertexCount: 0,
    selectionBuffer: buffer("selection-buffer"),
    selectionDrawRanges: {landMasked: {first: 0, count: 0}, ordinary: {first: 0, count: 0}},
    pointBuffer,
    pointVertexCount: 0,
    labelItems: [],
    cityIconItems: [],
    cityIconItemsById: new Map(),
    markerIconItems: [],
    militaryIconItems: [],
    cityIconLayer,
    cityMovePreview: null,
    oceanCurrentLayerStats: {minWidth: 0, maxWidth: 0},
    lastDraw: null
  });
  renderer.surfaceCellRanges = new Uint32Array(0);
  renderer.cellVisualCorrectionGeometry = new Uint32Array(0);
  renderer.cellAttributeStore = {};
  renderer.surfaceVerticesOwner = renderer.surfaceResourceOwner;
  renderer.surfaceCellRangesOwner = renderer.surfaceResourceOwner;
  renderer.cellVisualCorrectionGeometryOwner = renderer.surfaceResourceOwner;
  renderer.cellAttributeStoreOwner = renderer.surfaceResourceOwner;
  renderer.surfaceBaseBufferSet = {owner: renderer.surfaceResourceOwner};
  renderer.cellVisualCorrectionBufferSet = {owner: renderer.surfaceResourceOwner};
  renderer.surfaceResourceBinding = {
    owner: renderer.surfaceResourceOwner,
    surfaceVertices: renderer.surfaceVertices,
    surfaceCellRanges: renderer.surfaceCellRanges,
    cellVisualCorrectionGeometry: renderer.cellVisualCorrectionGeometry,
    cellAttributeStore: renderer.cellAttributeStore
  };
  renderer.renderCacheResourceOwners = Object.freeze({});
  renderer.renderCacheResourceBindings = Object.freeze({});
  for (const family of RENDER_CACHE_RESOURCE_FAMILIES) {
    adoptRenderCacheResourceBinding(renderer, family, renderer.surfaceResourceOwner);
  }
  adoptOverlayLabelResourceBinding(renderer, renderer.surfaceResourceOwner);
  gl.resetCalls();
  gl.nextError = gl.INVALID_OPERATION;
  renderer.draw({updateDynamicBuffers: false, updateOverlay: false, drawDirtyDynamicBuffers: false, trackPerformance: false});
  assert.deepEqual(gl.queryCounts, {getParameter: 0, isEnabled: 0}, "正式 renderer 城镇集成仍同步查询 GL 状态");
  assert.equal(gl.calls.filter(call => call.name === "drawArraysInstanced").length, 1, "正式 renderer 城镇集成不是单次 instanced draw");
  assert.equal(renderer.lastDraw.glError, gl.INVALID_OPERATION, "lastDraw 未使用正式 gl.getError 返回值");
  assert.deepEqual(gl.snapshotState(), {
    program: mainProgram,
    vertexArray: null,
    arrayBuffer: pointBuffer,
    blend: false,
    depthTest: false,
    depthWrite: false,
    blendSrcRgb: gl.SRC_ALPHA,
    blendDstRgb: gl.ONE_MINUS_SRC_ALPHA,
    blendSrcAlpha: gl.SRC_ALPHA,
    blendDstAlpha: gl.ONE_MINUS_SRC_ALPHA
  }, "正式 renderer 城镇绘制后的已知主尾态漂移");
  const tail = gl.calls.slice(-8);
  assert.deepEqual(tail.map(call => call.name), [
    "bindVertexArray", "bindBuffer", "useProgram", "blendFunc", "disable", "disable", "depthMask", "getError"
  ], "正式 renderer 城镇主尾态恢复顺序漂移");
  assert.deepEqual(tail[0].args, [null], "正式 renderer 未先解绑 city VAO");
  assert.deepEqual(tail[1].args, [gl.ARRAY_BUFFER, pointBuffer], "正式 renderer 未恢复 pointBuffer");
  assert.deepEqual(tail[2].args, [mainProgram], "正式 renderer 未恢复 main program");
  assert.deepEqual(tail[3].args, [gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA], "正式 renderer 未恢复主 blendFunc");
  assert.deepEqual(tail[4].args, [gl.BLEND]);
  assert.deepEqual(tail[5].args, [gl.DEPTH_TEST]);
  assert.deepEqual(tail[6].args, [false]);
}

testStandaloneStateContract();
testPlaceholderDrawTailState();

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
