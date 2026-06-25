# 中文命名库评估

本文记录阶段 18 后段命名系统的中文命名库调研结果。目标不是直接照搬一个随机姓名包，而是为城市、国家、省份、河流、湖泊和后续标签生成提供可复现、可审计、适合浏览器静态运行的中文命名基础。

## 需求约束

- 必须能被项目 seed 驱动，不能直接依赖不可控的全局随机结果。
- 必须能在当前原生 ESM + 静态服务器架构下运行；浏览器端不能依赖裸 npm 包名导入。
- 许可证必须清晰，不能引入非商业或相同方式共享的数据风险。
- 名称要适合幻想地图对象，不只适合真实现代人名。
- 后续要能进入 `lateStages.names` 对照 schema，逐步压低城市纹章、国家全名、河流/湖泊命名等后段 fail。

## 候选包

| 包 | 版本 | 许可证 | 主要能力 | 评估 |
|---|---:|---|---|---|
| `cnchar-name` | `3.2.6` | MIT | 中文名信息、随机生成名字、姓氏判断、姓名判断、自定义用字 | 推荐作为阶段 18 命名库基础。包体小，数据和 API 足够做中式根名，授权清晰。 |
| `mingzi-ts` | `1.0.1` | MIT，但 README 标注底层数据来自 `ChineseNames` / `CC BY-NC-SA` | 基于统计数据生成现代中文姓名，支持性别、复姓、含义评分 | 数据质量高，但非商业/相同方式共享的数据授权风险不适合直接纳入项目运行链路。 |
| `chinese-name` | `0.3.0` | MIT | 简单随机中文姓名 | 过旧，依赖老 `commander`，API 和数据都较薄，不作为首选。 |
| `random-chinese-name-generator` | `0.0.3` | MIT | 生成中文网名 | 输出偏网名，例如 `坏坏の小帅` 这类风格，不适合地图地名和国家命名。 |

## 推荐决策

选择 `cnchar-name@3.2.6` 作为有用的中文命名库参考和后续接入基础。

原因：

- 授权是 MIT，适合项目长期维护。
- 只含 `cnchar-types` 类型依赖，发布包体约 `84KB` 解包大小，实际运行代码约 `9.6KB`。
- 提供姓氏表、男女名常用字、`isName`、`isSurname` 和 `addName` 等接口，足够作为中文根名材料。
- 项目当前需要的是“中文地名/对象名生成基础”，不是严格复刻现代人口姓名统计；`cnchar-name` 更容易被包装成幻想地图命名器。

限制：

- 发布文件是 UMD 压缩包，不是浏览器原生 ESM；当前应用不能直接 `import "cnchar-name"`。
- 内部使用 `Math.random`，不能直接满足本项目 seed 可复现要求。
- 原包更偏中文人名。城市、国家、省份、河流、湖泊仍需要本项目自己的后缀、地貌词和对象类型规则。

## 接入策略

下一步不要直接把 npm 包裸导入正式应用，而是做一个本地 seedable wrapper：

1. 新增 `app/webgl-generator/src/generator/names.js`。
2. 以 `cnchar-name` 的 MIT 数据和 API 作为参考，整理项目内中文根名池，并保留来源和许可证说明。
3. 使用项目现有 `createRandom()` 选择字和后缀，保证同 seed 下名称稳定。
4. 先接入 `Burgs.specify()` 相关字段：
   - 城市 `name` 保持已有数量通过，但改为统一从命名器生成。
   - 城市 `group/type/population` 继续按 source 语义补齐。
   - 纹章字段可以先生成可验收的结构占位，再进入独立纹章阶段。
5. 后续再扩展国家 `fullName/formName`、省份 `pole/name`、河流/湖泊命名。

## 验收方式

阶段 18 命名本体第一项完成后，至少刷新强制 case：

```powershell
node .\tools\source-export-baseline.mjs --template mediterranean --cells 100000 --seed audit-mediterranean-001 --out-dir .\docs\source-baselines\mediterranean-100000-audit-mediterranean-001 --browser-channel chrome --timeout 180000 --screenshot false
node .\tools\webgl-generator-export-baseline.mjs --template mediterranean --cells 100000 --seed audit-mediterranean-001 --out-dir .\docs\source-baselines\mediterranean-100000-audit-mediterranean-001 --browser-channel chrome --timeout 180000 --screenshot false
node .\tools\baseline-diff.mjs --case mediterranean-100000-audit-mediterranean-001
```

预期第一步优先压低：

- `lateStages.names.burgCoas`
- `lateStages.statistics.burgsWithPopulation`
- `lateStages.names.stateFullNames`
- `lateStages.names.stateFormNames`

河流、湖泊、军事、marker 和 zones 可保留为后续步骤。
