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
| `cnchar-name` | `3.2.6` | MIT | 中文名信息、随机生成名字、姓氏判断、姓名判断、自定义用字 | 推荐作为阶段 18 人名感根名基础。包体小，数据和 API 足够做中式根名，授权清晰。 |
| `zoningjs` | `3.2024.0` | MIT | 中国县级以上行政区划名称数据 | 推荐作为中文地点名语感基础。包体很小，真实地名韵脚丰富，适合抽取地名词干和后缀，不直接输出真实行政区名。 |
| `province-city-china` | `8.5.8` | MIT | 中国省市区县和更细行政数据 | 数据完整，但解包约 `25MB`，对当前浏览器静态应用过重；可作为离线参考，不作为运行时依赖。 |
| `china-division` | `2.7.0` | MIT | 省、市、区县、乡镇、村居委会数据 | 数据非常完整，但解包约 `190MB`，明显不适合直接进入当前项目。 |
| `mingzi-ts` | `1.0.1` | MIT，但 README 标注底层数据来自 `ChineseNames` / `CC BY-NC-SA` | 基于统计数据生成现代中文姓名，支持性别、复姓、含义评分 | 数据质量高，但非商业/相同方式共享的数据授权风险不适合直接纳入项目运行链路。 |
| `chinese-name` | `0.3.0` | MIT | 简单随机中文姓名 | 过旧，依赖老 `commander`，API 和数据都较薄，不作为首选。 |
| `random-chinese-name-generator` | `0.0.3` | MIT | 生成中文网名 | 输出偏网名，例如 `坏坏の小帅` 这类风格，不适合地图地名和国家命名。 |

## 推荐决策

选择 `cnchar-name@3.2.6` 加 `zoningjs@3.2024.0` 的双来源策略：

- `cnchar-name` 用于人名感根字、文化名和少量专名材料。
- `zoningjs` 用于城市、城镇、区域、河湖和国家形容词的中文地名语感。

`zoningjs` 的 `0.json` 包含县级以上行政区划名称。拆包抽样显示约 `3678` 个去重名称，去除行政后缀后可得到约 `3400` 个地名词干；常见韵脚包括 `山`、`城`、`州`、`阳`、`江`、`河`、`川`、`水`、`溪`、`湖`、`陵`、`泉`、`龙`、`泽` 等，正好适合构建“真实地名底盘 + 轻玄幻修饰”的地点名生成器。

### `cnchar-name`

原因：

- 授权是 MIT，适合项目长期维护。
- 只含 `cnchar-types` 类型依赖，发布包体约 `84KB` 解包大小，实际运行代码约 `9.6KB`。
- 提供姓氏表、男女名常用字、`isName`、`isSurname` 和 `addName` 等接口，足够作为中文根名材料。
- 项目当前需要的是“中文地名/对象名生成基础”，不是严格复刻现代人口姓名统计；`cnchar-name` 更容易被包装成幻想地图命名器。

限制：

- 发布文件是 UMD 压缩包，不是浏览器原生 ESM；当前应用不能直接 `import "cnchar-name"`。
- 内部使用 `Math.random`，不能直接满足本项目 seed 可复现要求。
- 原包更偏中文人名。城市、国家、省份、河流、湖泊仍需要本项目自己的后缀、地貌词和对象类型规则。

### `zoningjs`

原因：

- 授权是 MIT，包内带 LICENSE。
- 压缩包约 `36KB`，解包约 `133KB`，核心数据文件约 `125KB`，比全量乡镇/村级数据包更适合浏览器静态应用。
- 数据来自县级以上行政区划，语感稳定，不会像网名包那样跑向现代网络昵称。
- 可以只提取词干、韵脚和地貌字，不直接复用真实完整行政区名，减少“现实地图穿帮感”。

限制：

- 这是行政区划数据，不是幻想地名生成器；玄幻色彩必须由本项目规则控制。
- 原始名称中有 `市辖区`、民族自治区域和现代行政后缀，接入时需要清洗过滤。
- 不宜在运行时保留完整行政层级查询 API；阶段 18 只需要离线整理出的轻量词素池。

## 中文地点名策略

地点名不要直接从人名池生成。建议采用三层权重：

| 风格层 | 占比建议 | 示例 | 用途 |
|---|---:|---|---|
| 真实地名感 | `70% - 80%` | 青溪、洛川、云阳、石门 | 大多数城市、村镇、省份 |
| 轻玄幻 | `15% - 25%` | 云麓、玄泽、星渊、玉衡 | 首都、圣城、山地/湖泊/古迹附近地点 |
| 高玄幻 | `0% - 5%` | 太微、烛龙、扶摇、归墟 | 极少数 marker、奇观、秘境，不用于普通城市泛滥 |

首轮词素建议：

- 真实地貌后缀：`山`、`岭`、`川`、`河`、`江`、`溪`、`湖`、`泽`、`原`、`谷`、`港`、`湾`、`陵`、`泉`、`城`、`州`、`阳`、`阴`。
- 轻玄幻前缀：`云`、`青`、`苍`、`玄`、`灵`、`玉`、`星`、`月`、`霜`、`岚`、`曜`、`澜`。
- 克制使用的高玄幻词：`太微`、`扶摇`、`归墟`、`烛龙`、`昆吾`、`瑶光`。

组合规则：

- 普通城镇优先二字名，少量三字名；避免四字以上。
- 河流偏 `清溪`、`洛水`、`沧河`、`青江` 这类水系后缀。
- 湖泊偏 `镜湖`、`玄泽`、`月泊`、`云梦`，但高玄幻词只给大湖或特殊地貌。
- 国家/省份可以在根名后接 `国`、`邦`、`领`、`诸州`、`王国` 等形制，形制本身由 `States.defineStateForms()` 决定。
- 同一 culture/state 内尽量复用少量前缀或韵脚，让区域内部有家族相似性。

## 接入策略

下一步不要直接把 npm 包裸导入正式应用，而是做一个本地 seedable wrapper：

1. 新增 `app/webgl-generator/src/generator/names.js`。
2. 以 `cnchar-name` 的 MIT 数据和 API 作为人名感参考，以 `zoningjs` 的行政地名数据作为地点名词素参考，并保留来源和许可证说明。
3. 使用项目现有 `createRandom()` 选择词干、后缀和轻玄幻修饰，保证同 seed 下名称稳定。
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
