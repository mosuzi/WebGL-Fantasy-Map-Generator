# 第 331 项：100k 重生成与存档性能、真实阶段 Loading

## 1. 调查结论

固定 `99846` cells 浏览器存档连续三次耗时 `16.316 / 17.219 / 18.804s`，IndexedDB 写入仅 `32.3 / 37.9 / 47.5ms`。最后一轮约到 `10.57s` 才进入 Worker compute，随后 normalize 到 stringify 约 `3.23s`、明示 stringify `1.058s`、gzip `3.767s`，base64、信封与写入合计约 `145ms`。瓶颈不是存储后端，而是整图 graph 输入和完整文档重复遍历。

当前 live map gzip 导出存在三次整图串行化：

1. `createMapDocument → stringifyMapDocument → parseMapDocument` 规范化；
2. 正式 `stringifyMapDocument(document)`；
3. `createCompressedMapDocumentBlob(document)` 内再次 stringify。

正式 100k 重生成基线显示：fresh rivers `13.343s`，其中整图输入 `6.505s`、compute `4.438s`、render install `1.723s`；同图 routes / markers reuse 后为 `2.991 / 3.312s`，输入降到 `5.6 / 5.3ms`，但 render install 仍约 `1.94 / 1.91s`，其中全量 picking 重绑约 `1.6～1.8s`。因此 fresh 与 warm 是两个独立瓶颈。

第 330 项治理了通用词表、防闪和编辑面板，但重生成仍把内部阶段折叠成“准备 / 计算 / 应用 / 更新画面”，保存 Worker 结束后的 base64、信封和实际存储没有继续上报阶段，故用户看到的文字既普通又可能与当前真实工作不一致。

## 2. 冻结不变量

- 普通用户文案不得出现 Worker、线程、会话、消息包、结构化克隆、picking、buffer、LocalStorage、IndexedDB、Blob 等实现词；调试数据不伪业务化。
- 进度只来自实际阶段切换和 completed / total，不用定时器伪造百分比。
- 存档文档、`.webfmg`、JSON、gzip-base64、旧 LocalStorage / IndexedDB、旧 schema、File / Blob 和云端上传继续兼容。
- 100k 优化不得原地覆盖正式 map / GPU 资源；取消、陈旧、失败和历史恢复仍按现有原子协议回滚。
- routes / cities / states / provinces 的港口、城市、路线、标签和 picking 依赖不能因性能优化被删层；无法证明未变化时必须使用完整 prepared render。
- 所有浏览器性能证据来自隔离 Chrome，不连接用户 Chrome，不修改用户地图；`source/` 与 Wiki 保持零改动。

## 3. 阶段矩阵

| 阶段 | 产品切片 | 最小门 | 非目标 |
| --- | --- | --- | --- |
| A | Worker / operation 精确阶段计时；重生成与保存 Loading 时间线 | user-copy、runtime operation、Worker telemetry Node；10k 浏览器时间线 | 不优化算法或存储 |
| B | 单次 serialize + 同文本 gzip；大存档二进制 IndexedDB；旧存档迁移读取 | map-file Node、browser storage Node、10k 往返、100k 三次保存 / 恢复 | 不改重生成 |
| C | canonical map mirror 复用；按领域写集复用未变化 picking / overlay，失败完整回退 | 十一类 Worker session、prepared installer、10k 浏览器、100k fresh / reuse 代表 | 不改变领域结果或删图层 |
| 集成 | 冻结 diff、独立复核、一次最终真实入口验收 | 构建、旧存档、10k、100k、错误面、Loading、LongTask | 不扩修相邻性能发现 |

## 4. Debug 标量

### 重生成

- `inputPackets / inputStreamMs / inputPostMaxMs`
- `domainComputeMs / patchCaptureMs / renderPrepareWorkerMs`
- `outputPackets / outputWorkerStreamMs / outputReceiveMs / outputDecodeMaxMs`
- `renderInstallPrepareMs / renderInstallCommitMs / uiRefreshMs / commitTotalMs`
- `renderInstallStages` 的 layer、count、completed、total、first / last
- session fresh / reuse、binding、最终 idle / invalidated

### 存档

- transport input / output packet、stream、post / decode max
- `normalizeMs / stringifyMs / compressMs / packageMs / workerTotalMs`
- `base64Ms / envelopeMs / writeMs`
- original / compressed / stored bytes、backend、fallback

## 5. 用户文案方向

重生成阶段固定表达为：

- 正在汇拢现有山河脉络
- 正在推演新的地理要素 / 河流 / 路线等目标内容
- 正在收束推演结果
- 正在重整画面与交互细节

保存阶段固定表达为：

- 正在收拢全图资料
- 正在压制存档体积
- 正在妥存至浏览器

成功继续使用既有 toast；取消、失败和并发仍走统一 operation 所有权与清理，不另造第二条状态源。

## 6. 基线与证据

- `work/task331-save-100k.log`
- `work/task322-stagee-100k-final/stdout.log`
- `work/task322-100k-fresh-routes-diagnostic/fresh-routes-trace.json`

本地长日志与临时诊断不入库，文档只保留结论、阶段边界和可复验字段。

## 7. 阶段 A checkpoint

- 重生成普通 Loading 已按实际 input、compute、result、commit、render 阶段显示“梳理现有内容、汇拢山河脉络、推演新内容、收束结果、归入地图、重整细节”；保存显示“收拢全图资料、压制存档体积、整理存档内容、妥存至浏览器”。
- runtime operation 阶段快照新增 `progress / completed / total / layer` 标量白名单，不保留任意对象；重生成 Worker 增加 setup / domain compute / patch / Worker render prepare，存档 Worker 增加 normalize / stringify / compress / package 计时。
- 10k 路线真实 Chrome 的可见文案依次覆盖六个阶段，fresh 输入 `214` 包 / `1108ms`、领域计算 `50.5ms`、patch `0.3ms`、Worker render prepare `34.1ms`、主线程 render install `888.3ms`，LongTask `0`。10k 存档四入口 Worker / prepared load、普通技术词、LongTask、health、console、page、WebGL 与 Loading 清理通过。
- 旧 `loading-single-source` 夹具仍拦截已不再使用的 `File.text()` 和 legacy `renderer.loadMapAsync`，连续两次夹具首败后已撤回局部迁移；阶段 A 改用现有 Worker 重生成工具的 `--loading-kind` 窄入口，不把旧夹具未执行断言计为通过。

## 8. 阶段 B checkpoint

- 当前 live map 导出不再以 stringify / parse 深拷贝做二次规范化；`createMapDocument` 直接经过当前 schema 校验。gzip helper 消费唯一正式 JSON 文本，Worker telemetry 固定 `serializationPasses = 1`；旧 document 导出仍保留既有迁移往返。
- 压缩结果达到 `4 MiB` 时不再先做 base64、JSON envelope 和必然超额的 LocalStorage 尝试，而是写入版本化 gzip bytes IndexedDB 记录；恢复把同一 `Uint8Array` 交给既有 map-file Worker。小存档、quota fallback、旧 plain / gzip-base64 envelope、LocalStorage 和旧 IndexedDB 字符串记录继续兼容。
- 10k quota fallback 连续三次保存为 `1.501～1.591s`，正式 JSON 序列化约 `143～153ms`、gzip约 `342～348ms`，普通 LocalStorage 与 fallback IndexedDB 均能恢复。固定 `99846` cells 连续三次保存由基线 `16.316～18.804s` 降至 `10.817～11.455s`；gzip `14,209,461B` 直接存储，`storageBytes === bytes`，base64 / encoding 均为 `0ms`，IndexedDB 写入约 `17ms`，二进制恢复保持 `99846` cells。
- map-file Worker Node、生产构建、10k / 100k 保存恢复、旧 v2 gzip-base64 LocalStorage 恢复与损坏存档保留均通过；application console / page error 为 `0`。剩余约 `6.23s` graph 输入与 `5.15s` Worker 内规范化 / stringify / gzip 是阶段 C 的 canonical mirror 优化对象，不能把阶段 B 当作最终性能完成。
