# 河流网络算法实验室

这是第304-A～G建立、由第313项与正式生成器共享算法的独立只读实验室。它把河流质量问题拆成固定夹具和可序列化诊断，不接管正式应用的运行时，也不写入地图、存档、历史、LocalStorage 或公开 API。

正式生成器现通过 `generator/river-network-candidate.js` 提供唯一候选实现，实验室只作薄转发、固定夹具和证据展示；页面中的 `formalGeneratorWrite: false` 只说明实验室没有写正式地图。四个实验室的统一定位见 [`../../docs/architecture/laboratory-prototypes.md`](../../docs/architecture/laboratory-prototypes.md)，AI 操作边界见 [`../../docs/ai/laboratory-prototypes.md`](../../docs/ai/laboratory-prototypes.md)。

## 启动

```powershell
pnpm run start:river-network-lab
```

然后打开 `http://127.0.0.1:5403/`。正式环境入口为 [https://fmg.mosuzi.top/prototype/river-network-lab/](https://fmg.mosuzi.top/prototype/river-network-lab/)。页面中的八类固定夹具分别覆盖孤立细线、未接入汇流、支流越级、父关系循环、合法汇流、非汇流交叉、湖泊路由和边界 / 入海口。

## 回归

```powershell
pnpm run regress:river-network-lab
```

回归会检查固定夹具预期 issue ID，并在隔离 Node 进程中对固定 seed 的 10k / 50k / 100k 生成结果建立只读河网快照。实验室为保留旧算法 / 新候选 A/B，会通过仅供诊断的内部参数关闭正式候选，然后把同一快照交给共享算法；正式应用的新图与显式河流重生成默认开启候选。

304-A提供审计和证据，304-B～G完成父子 DAG、局部汇流曲线、水文单调、碎线建议和安全门；第313项已把算法抽到正式共享模块。实验室仍只改自己的内存副本；它展示的 `formalGeneratorWrite: false` 表示实验室页面没有写正式地图，不表示正式生成器未接入。
