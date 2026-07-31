# 安全修改边界

无头读取 API 严格只读。独立无头写会话只开放六个方法，覆盖人口调整、高度选区平滑和对象重命名的 inspect/apply 配对；其它浏览器写方法返回 `headless_method_unsupported`，不得退化为裸字段赋值。

浏览器运行时修改时遵守：

1. 用 `info.describe(method)` 确认方法稳定性、输入 schema、mutates、requiresConfirm 和 businessCodes。
2. 优先调用同领域 `inspect*`，保存 inspectionToken、revision、affected、warnings、requiresConfirm 与拒绝 code。
3. 把疆域、山脊、丘陵、锁定对象、城市和路线等保持约束写成显式选择，不靠自然语言暗示。
4. execute 必须消费匹配的预检输入；高影响动作显式 confirm。
5. 执行后比较 checksum / revision、对象与区域统计、history、derivedStale；失败必须原子回滚。
6. 视觉结果还需真实浏览器检查，尤其是标签、图层、相机和 WebGL error。

复杂区域问题没有通用的局部降水覆写、人口自动追平或地形自动优化事务。可复用的现有写能力包括人口调整 / 转移、高度选区平滑 / 变换、气候全局设置及派生重建，但是否适合具体地图必须经过 inspector，不能把分析建议直接翻译为裸字段赋值。

## 无头写入流程

每次 apply 必须同时匹配 `documentId`、`expectedRevision`、`inspectionToken` 和唯一 `requestId`。成功后 revision 单调递增，HeadlessHistory 记录事务摘要，人口命令刷新正式派生数据，高度命令同步 Grid / Pack 高度并标记下游 stale；任何异常恢复整个地图文档快照。

```powershell
$inspection = node --no-warnings .\tools\webgl-generator-headless-write.mjs inspect .\input.webgl-map.json edit.objects.inspectRename '[{\"kind\":\"city\",\"id\":12},\"新城名\"]' | ConvertFrom-Json
node --no-warnings .\tools\webgl-generator-headless-write.mjs apply .\input.webgl-map.json .\output.webgl-map.json edit.objects.applyRename '[{\"kind\":\"city\",\"id\":12},\"新城名\"]' --document-id $inspection.data.documentId --expected-revision $inspection.data.revision --inspection-token $inspection.data.inspectionToken --request-id rename-city-12-v1
node --no-warnings .\tools\webgl-generator-headless-write.mjs verify .\output.webgl-map.json
```

默认输出路径必须不同于输入，且已有输出文件也不会静默覆盖。只有同时提供 `--overwrite --confirm-overwrite OVERWRITE` 才允许覆盖输入；这不是推荐工作流。JSON、gzip 和迁移后的 v1 输入均走相同事务路径，输出重新读取成功后才能报告修改完成。

锁定系统保护重生成对象，不等于保护任意 cell 数值。修改前同时检查 regeneration lock、目标 cells、政治归属、路线与城市约束。旧图只在显式操作时改变地图事实，加载迁移不得静默改人口、地形或疆域。
