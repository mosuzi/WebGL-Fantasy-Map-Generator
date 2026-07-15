# 地区、通用标记与独立备注创建闭环

本文档记录权威任务第 41 项的封闭实现边界。三类对象均复用统一编辑历史、选择解析、定位高亮和完整地图持久化，不引入额外的隐式派生重生成。

## 对象规则

- 地区使用非负整数 id，至少包含一个有效且连通的 pack cell；新地区不得与已有地区重叠。创建可由中心 cell 与半径生成连通 cell 集，删除同步清理地区备注并重算 metadata。
- 通用标记使用稳定的非负整数 id，数组位置不再充当对象身份。创建要求有效 pack cell，可选任意现有 marker 类型；删除同步清理标记备注，资源标记重生成不会改写保留标记的 id。
- 独立备注使用字符串对象 id，持久化 note id 为 `note:<objectId>`，并显式保存 `standalone / packCell / x / y`。位置可由 pack cell 或地图坐标给出；缺少有效位置的旧备注保留为孤儿数据，但不能被解析、定位或伪造坐标。

## UI 与 API 共路径

- 地区管理通过 `zone:add` 画布模式放置，通过统一命令删除；公开入口为 `api.edit.zones.create / delete`。
- 标记管理可选择全部 marker 类型并进入既有 `marker:add` 模式；公开入口继续使用 `api.edit.markers.add`，显式 id 与 UI 自动 id 走同一命令。
- 备注总览通过 `note:add` 模式放置独立备注，并可修改名称、正文或删除；公开入口为 `api.edit.notes.createStandalone`。
- 三类创建与删除只有命令执行成功后才结束画布模式；面板关闭、模式切换和地图替换沿统一模式管理器取消。

## 持久化与兼容

- 地区和标记继续由完整地图文档与要素 GeoJSON 导出；独立备注随完整地图文档保存其身份与位置。
- 对象解析器、selection mesh、renderer locate 边界和持久高亮均识别独立备注；坏坐标备注只按孤儿记录保留。
- 重复 id、非法 pack cell、非连通或重叠地区在命令执行前结构化拒绝，失败不写地图和历史。

## 验收证据

- `regress:auxiliary-object-creation` 固定验证三类创建、解析、选择 / 高亮、要素或完整地图导出、关联备注级联、metadata、撤销 / 重做、重复 id、坏坐标、孤儿备注和非法地区 cells。
- `regress:canvas-tools` 固定 19 个互斥画布模式及生命周期。
- API action、capabilities、edit coverage、stability 与 inventory 门禁固定到 11 个命名空间、168 个公开方法、78 个编辑方法，稳定等级为 160 / 7 / 1。
- 本项按快速迭代约定只执行代码回归与生产构建，不单独启动浏览器。
