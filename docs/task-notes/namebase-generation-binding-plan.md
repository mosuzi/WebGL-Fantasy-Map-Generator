# 名称库绑定生成计划

本文档记录名称库从“可管理数据”进入“影响后续生成”的设计。当前名称库总览已支持导出、追加/替换导入、复制内置库、重命名、编辑用户库样本、删除和清空用户库；全局/文化绑定、整图生成继承、本地偏好、样本权重、Markov 链路、编辑历史，以及城市和河流显式重命名第一刀均已接入。这些操作仍不自动改写当前地图对象名称。

## 原版参考

原版核心链路：

- `source/Fantasy-Map-Generator/src/generators/names-generator.ts`
  - `Names.calculateChain(namesList)`：从逗号分隔样本计算 Markov chain。
  - `Names.getBase(base, min, max, dupl)`：按名称库 id 生成名称。
  - `Names.getCulture()`、`Names.getState()` 等会读取文化或国家上下文。
- `source/Fantasy-Map-Generator/src/controllers/cultures-editor.ts`
  - 文化表有 `base` 字段，指向 `nameBases` 索引。
  - 如果引用的名称库不存在，会在下拉中显示 `removed`，不会立刻批量改名。
- `source/Fantasy-Map-Generator/src/controllers/namesbase-editor.ts`
  - 编辑样本后调用 `Names.updateChain(base)`，让后续生成使用新链。
  - 上传可以覆盖或追加整套 `nameBases`。

对 WebGL 版的启发：

- 绑定关系应使用稳定 id，而不是数组索引。
- 删除或替换名称库不应自动批量改写已有地图对象。
- 引用失效要可见、可修复，而不是静默退回或崩溃。

## 当前 WebGL 命名链路

主要入口：

- `app/webgl-generator/src/generator/names.js`
  - `createChineseNameGenerator(seed)` 当前只接 seed。
  - 内置词池和摘要函数也在此文件。
- `app/webgl-generator/src/generator/politics.js`
  - 国家、省份和区域命名依赖 `nameGenerator.generateStateName()`、`generateStateRoot()`、`generateProvinceName()`。
  - 国家命名已有春秋古国短名、单字根名和 `state-family` 去重策略。
- `app/webgl-generator/src/generator/settlements.js`
  - 城市命名依赖文化上下文和地名词素。
- `app/webgl-generator/src/generator/rivers.js`
  - 河流和湖泊命名依赖水文词根与文化上下文。
- `app/webgl-generator/src/generator/society.js`
  - 文化、宗教名和 `culture.nameStyle` 影响后续政治、城市和水文命名。

关键约束：

- 用户名称库不能直接替换国家完整命名流程，否则会破坏当前的古国短名、形制和同根去重。
- 用户名称库接入应先作为“候选源”，再进入现有去重、形制和后缀规则。
- 完整地图 JSON 已保存 `map.namebases`；内置库仍由代码版本提供。

## 数据契约

建议扩展 `map.namebases.bindings`：

```js
{
  version: 1,
  bases: [],
  bindings: {
    global: {
      stateRoot: "user-ancient-state-roots",
      place: "imported-place-roots",
      hydro: "imported-hydro-roots",
      culture: "",
      religion: ""
    },
    cultures: {
      "1": {
        stateRoot: "",
        place: "",
        hydro: ""
      }
    }
  },
  metadata: {
    bases: 3,
    imported: 2,
    updatedAt: "..."
  }
}
```

规则：

- `global` 是默认绑定；`cultures[cultureId]` 覆盖对应文化的城市、国家根名和水文名称来源。
- 绑定值为空表示使用当前内置生成策略。
- 绑定值指向不存在的名称库时，UI 显示“失效引用”，生成时退回内置策略，并在开发模式记录。
- 绑定只影响后续“重新生成名称”或整图重新生成，不自动改写已有对象。

## 分阶段实现

### 阶段 1：绑定数据和只读状态

目标：

- 在 `namebase-store.js` 增加绑定读写 helper。（已完成第一刀）
- 名称库总览显示某个用户库是否被绑定使用。（已完成第一刀）
- 绑定失效时能在面板中看到。（已完成第一刀）
- 当前只读诊断会扫描 `global` 与 `cultures` 绑定，显示“全局国家根名 / 文化 #1 地名”等用途；绑定指向不存在词池时显示“失效绑定引用”。

不做：

- 不改变生成结果。
- 不新增批量重命名。
- 第一刀不提供绑定编辑入口；后续阶段再接全局绑定编辑。

验收：

- 完整地图 JSON 能保存和恢复 `map.namebases.bindings`。
- 删除用户库后，绑定显示为失效，但不抛错。

### 阶段 2：全局绑定接入

目标：

- 名称库总览先提供全局 `stateRoot / place / hydro` 绑定编辑入口。（数据写入已完成第一刀）
- `createChineseNameGenerator(seed, {namebases})` 接收名称库上下文。（当前地图内受约束重生成已完成第一刀）
- 先接全局 `stateRoot / place / hydro` 三类：
  - `stateRoot` 只替换根名候选源，仍走国家形制、古国短名偏好和 `state-family` 去重。（已接入国家重生成）
  - `place` 只影响新生成城市名候选，不影响已有城市。（已接入城镇重生成）
  - `hydro` 只影响河流/湖泊新命名。（已接入水文重生成）

实现建议：

- 在 `names.js` 增加 `resolveNamebaseSource(kind, context)`。
- 第一刀已支持样本权重加权抽样；Markov 链路质量第一刀也已完成，生成预览与绑定生成共用项目内纯函数链路。
- 生成 summary 中记录实际使用的用户库 id，供开发模式追踪。

验收：

- 绑定自定义 `stateRoot` 后，新生成国家根名明显来自该词池，但仍没有同根重复爆炸。
- 删除绑定库后生成能安全退回内置策略。

当前状态：

- 已完成全局绑定编辑入口：用户可把 `stateRoot / place / hydro` 指向内置或用户名称库，也可恢复“使用内置策略”；失效引用会作为可见选项保留。
- 已完成全局绑定生成接入第一刀：`createChineseNameGenerator(seed, {namebases})` 会解析 `map.namebases.bindings.global`，当前地图内的国家/省份、城镇和水文受约束重生成会传入当前 `map.namebases`。
- 绑定值指向不存在词池时，生成器会退回内置策略；当前地图已有名称不会因为导入、编辑或绑定变化自动批量改写。
- 已完成整图生成继承第一刀：生成按钮和高度图导入会从当前地图复制用户名称库和绑定快照，作为本次生成的临时 `namebases` 上下文；新地图会保留 `map.namebases` 和 `metadata.namebases`，但 `map.options` 不写入用户库对象。
- 空白启动或当前地图没有 `namebases` 时，生成按钮和高度图导入已可读取应用级本地偏好；第一刀只使用 `localStorage` 快照，不引入云同步或账户级偏好。

### 阶段 3：文化级绑定

目标：

- 在文化管理面板或名称库面板中为文化设置 `stateRoot / place / hydro` 覆盖。（名称库面板入口已完成第一刀）
- 城市、河流和省份命名优先读取对象所属文化的绑定。（生成读取已完成第一刀）

风险：

- 城市和国家共用同一词池会产生“清河国 / 清河城”式重复；名称库面板已按目标类型过滤绑定候选库，当前不匹配的旧绑定会保留为“当前不匹配”选项，便于用户修复。
- 文化合并、删除或重新生成后，旧绑定可能变成孤儿，需要清理或标记。

验收：

- 同一地图中两个文化可使用不同城市词池。
- 文化绑定导出/导入完整保留。

当前状态：

- 已完成文化级绑定生成读取第一刀：`createChineseNameGenerator()` 会按命名对象的 `culture` 读取 `map.namebases.bindings.cultures[cultureId]`，文化绑定优先于全局绑定。
- 文化绑定为空时继续使用全局绑定；文化绑定填了但指向不存在词池时回退内置策略，不静默使用全局绑定。
- 已完成名称库面板文化绑定 UI 第一刀：面板可选择文化，并分别设置该文化的 `stateRoot / place / hydro` 覆盖。
- 已完成绑定候选按类型过滤第一刀：`stateRoot` 只显示 `state-root / generic`，`place` 显示 `place / place-part / generic`，`hydro` 显示 `hydro / generic`；后缀、形制等不再混入普通绑定下拉。
- 已完成文化管理面板快捷入口第一刀：文化管理的二级操作可直接打开名称库面板，并聚焦到当前文化的绑定区。
- 已完成应用级本地偏好第一刀：名称库写操作会保存快照到浏览器 `localStorage`，生成按钮和高度图导入可在当前地图没有 `namebases` 时继承该偏好。
- 已完成样本权重第一刀：绑定命中的用户库会解析 `名称|权重`、`名称*权重` 和重复样本，按合并后的权重抽取国家根名、地名和水文候选。
- 已完成 Markov 链路质量第一刀：绑定命中的用户库会从样本构建字符链，优先生成链式候选，再进入既有国家根名清洗、城镇后缀和水文后缀逻辑。
- 已完成编辑历史第一刀：名称库写操作和绑定修改会进入 `EditHistory` 快照命令；撤销/重做只恢复名称库上下文和本地偏好，不触发当前地图对象批量重命名。
- 已完成城市显式重命名第一刀：城市管理面板可由用户主动把当前筛选结果按当前 `place` 名称库重新命名；导入、删除、编辑或绑定名称库本身仍不会自动批量改名。
- 已完成河流显式重命名第一刀：河流管理面板可由用户主动把当前筛选结果按当前 `hydro` 名称库重新命名；该命令只写河流名称，不重建水文、河网或路线。

### 阶段 4：名称生成预览和质量分析

目标：

- 为用户库生成示例名称。
- 显示样本数、重复项、长度分布和基础质量提示。
- 已实现项目内纯函数 Markov chain，接近原版 `Names.calculateChain()` 的基础链路。

约束：

- Markov chain 是本项目自己的纯函数，不依赖 `source/` 全局状态。
- 示例生成不能改变地图 checksum。

### 阶段 5：显式重命名命令

目标：

- 在国家、城市、河流等面板提供“按当前名称库重新命名”。
- 该操作必须进入 `EditHistory`，并只影响用户明确选择的对象或范围。

当前状态：

- 城市管理面板已完成第一刀：可对当前筛选结果执行显式重命名，读取全局/文化 `place` 绑定，并可撤销/重做。
- 河流管理面板已完成第一刀：可对当前筛选结果执行显式重命名，读取全局/文化 `hydro` 绑定，并可撤销/重做。
- 国家、湖泊和跨对象选中范围仍待后续扩展。

不做：

- 不因为导入、删除或编辑名称库而自动批量改名。

## 验证矩阵

最小验证：

- 绑定用户 `stateRoot` 后生成 20 个国家，根名来源命中用户库，重复根为 `0` 或处于当前阈值内。
- 绑定用户 `place` 后生成城市，抽样城市名来源命中用户库。
- 绑定用户 `hydro` 后生成河流/湖泊，抽样水文名来源命中用户库。
- 删除已绑定用户库后，生成不报错，绑定显示失效，开发模式有记录。
- 导出完整地图再导入，绑定关系、失效状态和用户库都能恢复。

回归验证：

- 未绑定名称库时，国家短名和春秋古国风策略与当前结果保持一致。
- `state-family` 去重仍生效，不回到大量东/西/南/北同根国家名。
- 端到端生成耗时无明显退化。

## 暂缓项

- 完全兼容原版 `name|min|max|d|m|names` 文本格式的上传下载。
- AI 生成名称库。
- 从用户库自动推断文化类型。
- 自动重命名整张地图上的已有对象。
