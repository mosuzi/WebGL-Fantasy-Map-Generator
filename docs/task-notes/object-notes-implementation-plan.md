# 对象注记实现计划

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
2. 新增 `createSetObjectNoteCommand()`，进入 `EditHistory`，effects 使用 `selection: refresh`、`derived: ["object-panels"]`。（marker 第一刀已用 `createSetMarkerNoteCommand()` 完成）
3. 做共享 `UiNoteField`，使用 `ElInput type="textarea"`，支持应用和清空。（已完成）
4. 先接入对象详情面板与最常用专用面板：marker、city、river、route。（marker 已完成）
5. 第二批再接入 state、province、culture、religion、label；这些面板已有二级操作栏，适合新增“备注”动作。

## UI 方案

- 不使用常开侧栏，遵循现有二级编辑面板模式。
- 在对象表格行操作或详情操作中新增“备注”图标。
- 打开后显示对象名、当前备注、编辑 textarea、应用、清空、定位。
- 对象已有备注时，在列表行或详情里显示一个小的“有备注”标记。
- 后续可增加独立“备注总览”浮动面板，支持筛选、定位、导入导出 notes。

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
- 完整地图 JSON 导出已验证包含 `map.notes`。
- 尚未接入 city、river、route、state、province、culture、religion、label，也尚未做独立备注总览。
