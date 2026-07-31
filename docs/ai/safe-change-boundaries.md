# 安全修改边界

无头 API 第一阶段严格只读。它可以给出分析、候选 cell 和建议目标，但不能执行、模拟成功或覆盖输入文件。

浏览器运行时修改时遵守：

1. 用 `info.describe(method)` 确认方法稳定性、输入 schema、mutates、requiresConfirm 和 businessCodes。
2. 优先调用同领域 `inspect*`，保存 inspectionToken、revision、affected、warnings、requiresConfirm 与拒绝 code。
3. 把疆域、山脊、丘陵、锁定对象、城市和路线等保持约束写成显式选择，不靠自然语言暗示。
4. execute 必须消费匹配的预检输入；高影响动作显式 confirm。
5. 执行后比较 checksum / revision、对象与区域统计、history、derivedStale；失败必须原子回滚。
6. 视觉结果还需真实浏览器检查，尤其是标签、图层、相机和 WebGL error。

三个标准问题当前只完成分析能力，没有新增局部降水覆写、人口自动追平或高度自然化写事务。可复用的现有写能力包括人口调整 / 转移、高度选区平滑 / 变换、气候全局设置及派生重建，但是否适合具体地图必须经过 inspector，不能把分析建议直接翻译为裸字段赋值。

锁定系统保护重生成对象，不等于保护任意 cell 数值。修改前同时检查 regeneration lock、目标 cells、政治归属、路线与城市约束。旧图只在显式操作时改变地图事实，加载迁移不得静默改人口、地形或疆域。

