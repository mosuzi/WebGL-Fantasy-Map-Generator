# 选区地形模板完整体系

本文档记录权威任务第 38 项的多步骤地形模板、用户模板文档和 Source 转换边界。既有四种单步模板继续保留；多步骤程序按顺序消费上一步结果，最终只生成一组原始高度到最终高度的 changes，并通过同一个高度编辑命令形成一条撤销历史。2026-07-16 原准权威 `Q-09` 已转为权威任务第 79 项：优先补 `Strait`，并禁止 `Mask / Invert` 等未支持步骤继续被静默忽略。

## 固定模板程序

| id | 名称 | 步骤 | seed |
|---|---|---|---|
| `layered-upland` | 层叠高原 | 高原塑形 → 破碎地形 → 阶地量化 | 使用 |
| `terraced-basin` | 阶地盆地 | 盆地塑形 → 破碎地形 → 阶地量化 | 使用 |
| `source-archipelago-converted` | Source 群岛（转换） | Source 加值 → 破碎转换 → Source 平滑 → 破碎转换 | 使用 |

预览和应用都必须使用当前锁定选区、羽化权重、作用范围和同一个 seed。预览只公开每步影响数量、最终影响数量和 `changeChecksum`，不把完整 changes 放入 Vue 状态；应用前重新计算并同时比对数量与校验值。地图或选区变化后必须重新预览。

## 用户模板文档

文档类型为 `webgl-generator-height-terrain-templates`，当前版本为 `1`：

```json
{
  "documentType": "webgl-generator-height-terrain-templates",
  "version": 1,
  "templates": [
    {
      "id": "user-terrain-template",
      "name": "我的地形模板",
      "description": "由高度面板多步骤编排保存。",
      "user": true,
      "steps": [
        {"operation": "plateau", "intensity": 0.7, "targetHeight": 68},
        {"operation": "rugged", "intensity": 0.4, "amplitude": 10, "seedOffset": 0}
      ]
    }
  ]
}
```

- 每个模板包含 1～12 步；id、名称、说明和所有数值范围在导入时一次性校验。
- 面板可把当前单步模板及参数加入编排、删除步骤、清空、保存和删除用户模板。
- 用户模板保存在 `webgl-generator-height-terrain-templates-v1` LocalStorage 键；导出和导入使用同一规范化文档。导入先完整解析、版本检查和步骤检查，全部通过后才合并并持久化。
- 同 id 的导入模板覆盖已有用户模板；内置模板不能删除，也不会写入用户模板文档。
- 未知文档类型、未知版本、重复 id、未知步骤、非法数值或超过 12 步会整体拒绝，不改变当前地图或已保存模板。

## Source 模板兼容边界

只读对照 `source/Fantasy-Map-Generator/public/config/heightmap-templates.js` 和 `src/generators/heightmap-generator.ts` 后，当前边界如下：

| Source 指令 | 兼容级别 | 当前处理 |
|---|---|---|
| `Add` | 完整兼容 | 按高度范围加值，陆地范围保持海平面基线 |
| `Multiply` | 完整兼容 | 按高度范围乘算，陆地范围以高度 20 为基线 |
| `Smooth` | 完整兼容 | 读取同一轮修改前快照，按共享边邻居和系数平滑 |
| `Hill` / `Pit` / `Range` / `Trough` | 转换兼容 | 转为选区内稳定 seed 的高原、盆地、破碎和阶地步骤；保持创作意图，不承诺逐 cell 等同 Source 全图生成器 |
| `Strait` | 不支持 | 需要全图方向、边界和连通切割，不能安全缩减为任意锁定选区操作 |
| `Mask` | 不支持 | 依赖全图归一化坐标与图幅边缘，不适合作为局部选区模板 |
| `Invert` | 不支持 | 依赖规则网格镜像轴；当前 Voronoi 选区没有等价索引镜像 |

`source-archipelago-converted` 是固定转换样本：原模板中的 `Add 11` 和 `Smooth 3` 精确映射，`Range / Hill / Trough` 合并成两步确定性破碎塑形，`Strait` 在 source 元数据中显式列为未支持。该样本用于验证转换文档、seed 可复现和执行闭环，不宣称与 Source 全图 Archipelago 像素一致。

## 回归与边界

- `pnpm run regress:height-template-programs` 覆盖固定模板可复现、不同 seed 变化、预览与 changes 数量 / 校验值、单条历史、撤销 / 重做、用户文档往返、存储恢复、坏版本、坏步骤和 Source 群岛转换样本。
- `pnpm run regress:height-brush` 继续覆盖四种单步模板、选区羽化和统一高度命令。
- 本项按快速迭代约定执行纯代码回归和生产构建，不把未执行的浏览器交互表述为真实 UI 验收。
