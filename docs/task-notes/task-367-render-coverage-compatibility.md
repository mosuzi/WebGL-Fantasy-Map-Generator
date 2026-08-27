# 第 367 项：导入渲染 cell 覆盖缺失的兼容补建

## 冻结契约

- 最终目标：GPU 常驻紧凑 surface 的派生 `cell identity / surfaceCellRanges` 缺失或不完整时，优先从当前 canonical grid 补建完整 surface，让可读取的旧存档继续加载。
- 当前阶段：先固定覆盖检查与补建边界，再实现单点恢复，最后执行专项和指定真实存档 production UI 验收。
- 非目标：不修改存档 schema，不回写 canonical map，不改变海岸 / 行政柔化算法、道路生成或其它对象重生成逻辑。
- 唯一写者：主线程；产品文件限定为 `renderer/render-preparation.js` 及确有必要的同层 surface helper，测试文件限定为现有 render preparation 专项。
- 首个廉价门：`pnpm run regress:render-preparation`；若首败先保存精确错误，最多一次最窄修正和一次目标复验。

## 兼容与硬门

1. 旧的或局部派生结果缺少 `surfaceCellRanges`、ranges 有中间缺口 / 末尾截断、或紧凑基础几何未携带时，不直接返回 `render-surface-compact-ranges-*`。
2. 使用当前 canonical grid 的高度、顶点、cell 多边形和地图尺寸重新生成紧凑位置与 cell identity；补建过程只产生新的渲染 DTO。
3. 补建结果仍需验证基础几何长度、identity 合法、ranges 单调连续并覆盖全部几何。
4. canonical grid 缺失基础容器、坐标不可解释或 cell 无法形成安全表面时保持结构化失败；这类失败说明生成来源不可用，而非兼容字段缺失。

## 验收结果

- Node：`ranges-missing / ranges-gap / ranges-tail-truncated / geometry-missing / identity-missing` 五类派生损坏均从 canonical grid 补建，geometry checksum 与完整 ranges 和正常路径完全相同；`grid.cells.v = null` 的规范源损坏反例固定返回 `render-surface-compact-rebuild-failed ← grid-cell-surface-source-invalid`。补建前后 `grid / grid.cells / pack` owner 引用不变。
- 浏览器：唯一输入为 `C:\Users\mosuzi\Downloads\krichars (3).webfmg`，SHA-256 为 `CF7402BC2BEA22AD1FCDE441444479F880DC0DB15D55520EF5A1A399D335DA61`。最终 `v0.5.76` production UI 冷导入 `4185ms`，其中 prepare `3160.5ms`、prepared install `430.5ms`；最终恢复 `100000 grid / 43419 pack / 1251 cities / 442 routes / 7976 segments`，完整彩色全图、西陆、道路、河流、城镇、标签和国界均可见，Loading 归零、WebGL error `0`，健康窗仅有 `map-ready` 信息。
- 门禁：`regress:render-preparation`、`regress:prepared-render-installer`（`21` cases）、`regress:gpu-display-mutation`、`typecheck:core` 与 `1407 modules` production build 通过；完成版本为 `0.5.76`。
