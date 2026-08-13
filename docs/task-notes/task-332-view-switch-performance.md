# 第 332 项：100k 视图切换性能

## 1. 调查结论

固定 `99846` cells 新图从高度视图切换到国家视图时，首次操作约 `14.6s`：完整地图镜像输入约占 `8.4s`，Worker 首次建立 surface / shore / state / province 几何缓存约占 `5.7s`。此后同图切换仍重复建立这些不随颜色模式变化的几何缓存，国家 / 省份 / 生物群系 / 人口 / 高度每次约 `5.9～6.7s`，是用户看到长期等待的主因。

主题、海洋高度、平滑边界和标签上限也复用了地图镜像，却同样丢弃上述几何缓存。主题和标签还会重建 overlay；修复几何缓存后，100k 主题 / 标签入口偶发 `50～121ms` 的 `self` LongTask。该信号已经过一次高层分段调查，位于 prepared overlay 安装后的标签布局 / 浏览器样式提交，不是 Worker 输入、surface builder 或 WebGL 上传。

## 2. 实施边界

- 持久 `render.prepare` / `regeneration.compute render-only` Worker session 在同一 `mapIdentity + mapRevision` 下复用 cell visual、shore、state path 和 province path 缓存。
- 地图 revision 变化、领域写任务、换图和 session 失效必须清除缓存；政治 mesh 继续按主题 / debug 请求重建，不跨请求错误复用。
- 视图切换继续使用独立 map-mirror session、`allowFallback:false`、delta `0` 提交和 prepared renderer 原子事务；不得回退主线程、删层或跳过 overlay / picking。
- 首次切换仍须建立完整 Worker 镜像和缓存，但过程分片让步并由自然中文 Loading 表达，不以失败的后台预热把成本藏到新图完成之后。

## 3. 性能边界

- 10k 的 `height → states → provinces → biomes → population → height`、主题与关键视图选项全部要求 LongTask `0`。
- 100k 首次真实切换允许建立一次 fresh 镜像，稳定时间上限 `30s`；随后同 session 输入包不超过 `3`，普通颜色 / 视图选项稳定时间 `<2s`，主题 `<2.5s`，标签上限 `<1s`。
- 100k 只有主题和标签上限入口可登记 `self≤130ms`：每个主题动作最多 `1` 条、每个标签动作最多 `2` 条；其它视图切换仍要求 LongTask `0`。该登记不提高通用阈值，也不允许跨入口共享额度。
- 两档均锁地图 / renderer identity、revision、checksum、history、camera、selection、highlight、picking、Loading、错误级 health、console、page 和 WebGL。

## 4. 当前证据

- Node 渲染准备门确认：同 revision 第二次 surface 准备复用四类正式缓存；revision `+1` 后四类缓存全部重建。
- Worker 十一类、fallback、cancel、session 与 deferred renderer 回归通过；只有 `render.prepare` 和 render-only regeneration 可复用缓存。
- 独立观察使最终 10k：首次国家视图 `2947.2ms / 210` 输入包，后续同 session 每项 `3` 包、`180.4～435.8ms`，LongTask `0`。
- 独立观察使最终 100k：首次国家视图 `15076.3ms / 1013` 输入包，后续同 session 每项 `3` 包、`513.3～1635.6ms`；仅主题切换出现 `64 / 52ms` 两条 `self`，标签与其它入口 LongTask 为 `0`。
- 13 个实际 Worker 动作逐项绑定独立 operation ID 和精确名称；两档地图 / renderer / history / camera / selection / highlight / picking 与错误面全部通过，独立集成复核和最终观察使均 `ACCEPT`。

本地详细结果保存在 `work/task332-view-switch-*`，不写入仓库。`source/`、Wiki、用户 Chrome 和用户地图不在本项范围。
