# 区域定义与证据化分析

## 区域定义

`analysis.defineRegion(spec)` 支持：

- `{cells:[1,2,3]}`；
- `{kind:"state",id:3}`、`province`、`zone`；
- `{kind:"all-land"}`；
- `{operation:"union|intersection|difference",regions:[...]}`。

所有非法、越界或重复 cell 会被验证 / 去重 / 排序。返回 specification、`space=pack`、cells、count 和 source checksum。

## 方法

| 方法 | 用途 | 关键输出 |
|---|---|---|
| `analysis.describeRegion` | 单区域事实基线 | 高度、降水、温度、宜居度、坡度、粗糙度、人口、城市、路线、归属、证据 cell |
| `analysis.compareRegions` | 两区域差异 | 左右完整基线、delta 与 wetter / populous / suitable / rougher 判断 |
| `analysis.explainPrecipitation` | 降水低值与地形屏障共现 | dryCells、barrierCells、谨慎因果说明 |
| `analysis.diagnosePopulation` | 人口承载与候选 cell | capacityScore、限制因子、候选 cell |
| `analysis.comparePower` | 透明代理国力比较 | 左右分数、ratio、组成字段 |
| `analysis.diagnoseTerrain` | 过陡 / 崎岖检测 | roughCells、abruptCells、建议 P90 目标 |

## 标准分析顺序

1. 用对象查询确认目标国家 / 省份 / 地区 id，不按显示名猜 id。
2. 定义目标区和至少一个对照区；用交 / 差排除山地、水域或非目标政权。
3. `describeRegion` 固定现状；记录 checksum、staleSystems、count 和单位。
4. 调用专门诊断；检查 evidence cells 是否真的落在目标范围。
5. 把结论拆为“直接事实”“空间共现推断”“需要风向 / 道路 / 规则继续验证”。
6. 形成目标区间和保持约束；无头会话到此停止，浏览器会话才进入 inspector。

## 常见误区

- 山脉与低降水共现不自动证明雨影；还需大气风向和迎风侧 / 背风侧对照。
- 高 suitability 不自动生成人口；还需城市锚点、道路、政治安全和人口事务。
- 把山峰整体压低会破坏地形关系；优先限制局部坡度 / 粗糙度 P90 并保持分水岭、海平面和相对 relief。
- 不同面积区域直接比较人口总量会误导；同时比较每 cell 人口与城市 / 路线覆盖。

