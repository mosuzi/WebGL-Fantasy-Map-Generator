# 对象注记实现计划

> 状态校准（2026-07-16）：纯文本对象备注、独立备注、总览、摘要导入导出和孤儿批量治理均已完成；权威任务第 65 项只补独立备注的 selection 面板绑定。富文本与 AI 生成继续暂缓。

本文档记录对照原版 FMG Notes Editor 后，WebGL 版对象注记系统的第一阶段设计。该功能目标是让用户给地图对象添加可保存、可导入导出、可定位的自由文本说明；第一刀只做纯文本或轻量 Markdown，不接 TinyMCE、不接 AI 生成。

## 原版行为摘录

- 原版入口为 `source/Fantasy-Map-Generator/public/modules/ui/notes-editor.js` 的 `editNotes(id, name)`。
- 原版全局数据为 `notes[]`，每条形如 `{id, name, legend}`。
- `id` 直接绑定 SVG / 业务对象，例如 `burg12`、`marker5`、`river3`、`route7`、`regiment2` 等。
- 编辑器支持对象下拉、名称、富文本正文、定位、AI 生成、pin、下载和上传。
- 生成器会为 marker、military 等对象自动写入说明；部分对象被删除或重命名时会同步移除或迁移 note。

## WebGL 版数据契约

建议在 `map.notes` 下新增独立结构：

```js
{
  notes: [
    {
      id: "marker:12",
      kind: "marker",
      objectId: 12,
      name: "铜山矿脉",
      body: "这里可以写资源、传说或制图备注。",
      format: "plain",
      pinned: false,
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z"
    }
  ],
  metadata: {
    notes: 1,
    formatVersion: 1
  }
}
```

约束：

- `id` 使用 `${kind}:${objectId}`，避免原版 SVG id 与新对象 kind 混杂。
- `kind` 复用 `OBJECT_KIND`：state、province、culture、religion、city、marker、route、river、region、label。
- `name` 是显示名快照；对象重命名后可以同步更新，但不作为定位依据。
- `body` 第一阶段只按纯文本保存；后续如支持 Markdown，应通过 `format` 标记。
- 完整地图 JSON 导出/导入天然包含 `map.notes`；GeoJSON 可在后续把匹配 note 的摘要写入 properties。

## 第一阶段入口

优先实现顺序：

1. 新增 `object-notes.js` 运行时 helper：生成 note id、读取、写入、删除、统计。（已完成）
2. 新增 `createSetObjectNoteCommand()`，进入 `EditHistory`，effects 使用 `selection: refresh`、`derived: ["object-panels"]`。（marker / city / river / route 已先用各自命令完成）
3. 做共享 `UiNoteField`，使用 `ElInput type="textarea"`，支持应用和清空。（已完成）
4. 先接入对象详情面板与最常用专用面板：marker、city、river、route。（已完成）
5. 第二批再接入 state、province、culture、religion、label；这些面板已有二级操作栏，适合新增“备注”动作。

## UI 方案

- 不使用常开侧栏，遵循现有二级编辑面板模式。
- 在对象表格行操作或详情操作中新增“备注”图标。
- 打开后显示对象名、当前备注、编辑 textarea、应用、清空、定位。
- 对象已有备注时，在列表行或详情里显示一个小的“有备注”标记。
- 独立“备注总览”浮动面板支持筛选、排序、定位、删除、孤儿备注标记、撤销/重做、备注摘要导出，以及预检后的追加 / 替换导入和孤儿批量治理。

## 风险

- selection object 是 resolver 生成的快照，不能直接把 note 写在 selection object 上。
- 国家、城市、河流等对象有专用面板，不能只改 ObjectDetailsPanel，否则覆盖不完整。
- 生成或局部重算会删除部分对象，notes 需要保留为孤儿备注还是自动清理需要产品判断。第一阶段建议保留孤儿备注，并在备注总览里标记“对象缺失”。
- 若后续支持 HTML 富文本，需要做 XSS 清理；第一阶段纯文本可规避。

## 验收建议

- 给 marker 写备注，切换选择后再回来，备注仍在。
- 撤销/重做能恢复备注正文。
- 导出完整地图 JSON 再导入，备注仍在。
- 对象重命名后备注显示名同步或至少定位仍可用。
- 删除或重生成对象后备注不会导致面板崩溃。

## 当前进度

- marker 备注第一刀已完成：资源与标记管理面板新增二级“编辑备注”，支持纯文本写入、清空、撤销和重做。
- city 备注第一刀已完成：城市管理面板新增二级“编辑备注”，支持纯文本写入、清空、撤销和重做。
- river 备注第一刀已完成：河流管理面板新增二级“编辑备注”，支持纯文本写入、清空、撤销和重做。
- route 备注第一刀已完成：路线管理面板新增二级“编辑备注”，支持纯文本写入、清空、撤销和重做。
- state / province 备注第一刀已完成：国家编辑和省份管理面板新增二级“编辑备注”，支持纯文本写入、清空、撤销和重做。
- culture / religion 备注第一刀已完成：文化管理和宗教管理面板新增二级“编辑备注”，支持纯文本写入、清空、撤销和重做。
- label 备注第一刀已完成：标签管理面板新增二级“编辑备注”，标签 note id 使用 `label:${targetKind}:${targetId}` 复合键避免碰撞。
- 备注总览第一刀已完成：管理 tab 新增“备注总览”入口，独立浮层列出所有 `map.notes`，支持筛选、排序、定位、删除和历史撤销/重做，并会把对象缺失的备注标为孤儿备注。
- 备注摘要导出第一刀已完成：备注总览可导出当前筛选结果为 `webgl-generator-notes-summary v1`，用于外部阅读或脚本处理，不替代完整地图 JSON。
- 完整地图 JSON 导出已验证包含 marker、city、river、route、state、province、culture、religion 与 label 的 `map.notes`。
- marker、river 与 route 要素 GeoJSON 已写入 `hasNote` 和 `note` 属性；其中 marker 和 route 已完成端到端导出验证。
- 备注独立导入与孤儿批量治理已完成：`webgl-generator-notes-summary v1` 导出补齐 `format / pinned` 持久字段，可预检后追加或替换导回；重复 id、对象缺失、坏版本和混合有效 / 无效记录均有结构化诊断，缺失对象记录会保留为孤儿备注。
- 备注总览新增导入方式、预检确认 / 取消、“只选孤儿备注”和单事务批量删除；批量导出继续复用既有已选行导出。UI 与 `api.edit.notes.import / deleteBatch` 共用同一 edit command，撤销会恢复完整备注顺序和元数据。
- `pnpm run regress:note-import` 覆盖当前摘要持久字段往返、预检无写入、坏版本、混合记录、追加导入、批量删除、撤销 / 重做和缺少 notes 存储的旧地图；生产构建与 API 稳定门禁通过。
- 尚未做富文本、Markdown 或 AI 生成；当前继续只保存 `plain` 纯文本。
