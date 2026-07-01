# 名称库编辑器实现计划

本文档记录对照原版 `Namesbase Editor` 后，WebGL 版名称库能力的实现边界。当前生成器已有中文词池、春秋古国风国家根名和标签管理，但还没有可由用户维护的名称库、文化绑定和导入导出格式。

## 原版行为摘录

- 原版入口：
  - `source/Fantasy-Map-Generator/src/controllers/namesbase-editor.ts`
  - `source/Fantasy-Map-Generator/src/generators/names-generator.ts`
  - `source/Fantasy-Map-Generator/src/index.html` 中的 `#namesbaseEditor`
- 全局数据为 `nameBases: NameBase[]`，每项包含：
  - `name`：名称库名。
  - `i`：索引。
  - `min / max`：生成名称推荐长度。
  - `d`：允许连续重复的字符。
  - `m`：旧版多词率字段，现基本废弃。
  - `b`：逗号分隔的源名称列表。
- 原版生成逻辑基于 Markov chain：
  - `Names.calculateChain(namesList)` 从名称样本生成链。
  - `Names.getBase(base, min, max, dupl)` 按链生成名称。
  - `Names.getCulture()`、`Names.getState()` 等会读取文化绑定的 `base`。
- 原版编辑器能力：
  - 选择名称库。
  - 编辑名称样本、名称库名、最短/最长长度、允许重复字符。
  - 生成示例。
  - 分析样本数量、平均链路多样性、名称长度、重复项、非基础字符和多词比例。
  - 新增名称库。
  - 恢复默认。
  - 下载为 `name|min|max|d|m|names` 文本。
  - 上传并选择覆盖或追加。

## WebGL 版目标

名称库系统应服务三件事：

1. 给用户可控的命名入口，而不是只能接受内置中文词池。
2. 支持文化、国家、省份、城市、河流和标签后续逐步绑定名称来源。
3. 不破坏当前已经优化过的中文命名策略，尤其是春秋古国短名和 `state-family` 去重。

## 数据契约建议

建议在完整地图 JSON 中增加可选 `map.namebases`：

```js
{
  version: 1,
  bases: [
    {
      id: "ancient-states",
      name: "春秋古国",
      kind: "state-root",
      min: 1,
      max: 3,
      duplicateChars: "",
      source: "齐,晋,秦,楚,鲁,宋,卫,郑",
      builtin: true,
      enabled: true,
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z"
    }
  ],
  bindings: {
    stateRoot: "ancient-states",
    city: "chinese-places",
    river: "chinese-hydro"
  },
  metadata: {
    bases: 2
  }
}
```

约束：

- `id` 使用稳定字符串，不使用数组索引，避免导入追加后绑定错位。
- `kind` 用于限定使用场景，例如 `state-root / place / hydro / culture / generic`。
- `source` 第一阶段可继续使用逗号分隔文本，便于兼容原版下载格式。
- `builtin` 标记内置名称库，默认不直接删除；用户可复制后编辑。
- `bindings` 第一阶段只做全局绑定，文化级绑定后续再接。
- 完整地图 JSON 导出/导入应保留 `map.namebases`。

## 阶段拆分

### 阶段 1：只读名称库总览

目标：

- 新增“名称库”浮动面板，先只展示当前内置词池摘要。
- 统计每个词池的样本数、最短/最长长度、重复样本数和示例名称。
- 不改变生成逻辑。

建议入口：

- 管理 tab 新增“名称库”按钮。
- 面板按 `国家根名 / 城镇地名 / 水文名称 / 文化风格` 分类展示。

验收：

- 面板能显示春秋古国根名数量、样例和重复项统计。
- 不影响生成结果 checksum。

当前状态：

- 已完成第一刀：管理 tab 可打开“名称库总览”浮层，展示内置词池的分类、样本数、唯一样本、重复样本、长度范围和样例。
- 当前仍是纯只读能力，不写入 `map.namebases`，也不改变 `createChineseNameGenerator(seed)` 的参数或生成流程。

### 阶段 2：名称库导出

目标：

- 导出当前名称库为 `webgl-generator-namebases v1` JSON。
- 可选附带原版兼容文本：`name|min|max|d|m|names`。

验收：

- 导出文件包含所有内置词池和用户词池元数据。
- 导出不改变地图。

当前状态：

- 已完成第一刀：名称库总览可导出当前内置词池 JSON，包含完整 `source` 数组、统计口径和当前地图 seed/checksum。
- 导出的名称库 JSON 目前可以重新导入为用户库；导出入口现在会导出当前内置库与用户库，编辑和绑定后置。

### 阶段 2.5：名称库导入保存

目标：

- 支持从本地文件导入 `webgl-generator-namebases v1`。
- 导入内容进入 `map.namebases.bases`，随完整地图 JSON 保存和恢复。
- 当前仍不接生成逻辑，避免导入文件立即改变地图对象名称。

当前状态：

- 已完成第一刀：导入名称库会追加为 `origin = "导入"` 的用户库，并在总览面板与内置库一起展示。
- 导入库 id 会加 `imported-` 前缀并避让冲突；空词池会跳过。
- 已补导入追加/替换、“新建用户库”、“复制内置”、“重命名”、“样本编辑”、“删除选中”和“清空用户库”入口，可从零创建手动用户库，也可把内置库复制为用户库、重命名用户库、编辑用户库样本、从 `map.namebases.bases` 删除单个用户库或一次性清空用户库；总览详情已有样本规模质量提示。
- 已补样例生成预览：当前实现为轻量字符链和词根重组，只在名称库浮层中展示候选，不写 `map.namebases`，也不影响当前地图对象名称。

后续：

- 补链路多样性、权重、冲突预览和绑定。
- 若要接近原版 `Names.calculateChain()`，应追加项目内纯函数 Markov chain，并与当前轻量预览做对照。
- 补名称库编辑历史栈。

### 阶段 3：用户自定义名称库

目标：

- 支持新增、编辑、删除用户名称库。
- 支持复制内置名称库为用户名称库。
- 支持示例生成和质量分析。

当前状态：

- 已支持新建、复制、重命名、编辑样本、删除和清空用户名称库；新建库会自动选中并带 5 个可替换的二字默认样本。
- 这些操作仍是名称库数据管理能力，不自动改写地图对象名称，也不进入 `EditHistory`。

实现要点：

- 第一版已用项目自己的轻量字符链和词根重组生成示例，且按样本长度分桶选择起始字符，避免二字样本被截成怪异单字。
- 如果要复刻原版 Markov chain，应单独实现纯函数 `calculateNamebaseChain()` 和 `generateNameFromChain()`，不要依赖 source 全局状态。
- 编辑必须进入 `EditHistory` 或独立名称库历史栈，避免误操作无法撤回。

### 阶段 4：绑定到生成系统

目标：

- 名称库真正影响生成：
  - 国家根名。
  - 城市名称。
  - 河流/湖泊名称。
  - 文化名称。
- 后续再做文化级绑定，例如某个文化指定城市名称库和国家根名库。

风险：

- 国家命名已有 `state-family` 去重和古国形制特殊处理，用户名称库接入时仍需走同一去重路径。
- 城市名称和国家根名不能简单共用，否则会回到“清河国 / 清河城 / 东清河邦”式重复。
- 导入覆盖名称库后，已有地图对象名称不应自动改写；只影响后续重新生成或显式重命名。

## 与当前代码的建议关系

- `app/webgl-generator/src/generator/names.js` 当前词池为模块内常量；后续可先导出 `getBuiltinNamebaseSummaries()`，供只读面板使用。
- 生成器 `createChineseNameGenerator(seed)` 可以后续接收 `namebaseStore` 或 `namebaseOptions`，但第一阶段不要改签名。
- `map.namebases` 可先只在完整地图 JSON 中保存用户自定义库；内置库由代码版本提供。
- 名称库编辑 UI 应使用现有浮动面板和 Element Plus 控件，不新增常驻侧栏。

## 暂缓项

- 语音朗读示例。
- 连接 Cartography Assets。
- 与原版全量名称库完全兼容。
- AI 生成名称库。
- 名称库变更后自动批量重命名当前地图所有对象。

## 绑定生成专项

名称库真正影响国家、城市、河流、湖泊和文化命名时会牵动多个生成阶段，专项计划见：

- `docs/task-notes/namebase-generation-binding-plan.md`

## 建议下一步

1. 建立 `map.namebases.bindings` 的读写 helper 和失效引用显示。
2. 做全局 `stateRoot / place / hydro` 绑定，不自动改已有名称，只影响显式重新生成。
3. 再考虑文化级绑定和显式重命名命令。
4. 需要更接近原版时，再追加纯函数 Markov chain 与当前轻量预览对照。
