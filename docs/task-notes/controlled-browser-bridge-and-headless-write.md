# 第 227～228 项：当前标签页受控桥与无头写入施工图

## 目标与依赖

第 223～225 项已经提供无头读取、区域分析、AI 文档和浏览器公开 API，但外部 AI 不能从隔离浏览器控制环境直接调用页面主世界 API；无头运行时也仍严格只读。本批补齐两个独立闭环：第 227 项连接当前标签页，第 228 项安全修改明确输入的地图文件。

## 第 227 项架构

普通应用静态加载 `ai-bridge-bootstrap`，只负责开发面板入口、状态和动态导入。主模块 `ai-browser-bridge` 单独分包，在显式开启后连接 `127.0.0.1:5412` 的本地回环服务。服务只做命令邮箱与结果转发，不持有浏览器 Cookie、地图或任意脚本能力。

身份分层：

- `pairingId`：本次浏览器会话可恢复的本机配对；
- `pageSessionId`：每次页面加载生成，刷新即变化；
- `sessionToken`：服务颁发的短期连接令牌；
- `documentId`：地图文档稳定身份；
- `revision`：正式地图事务版本；
- `contentChecksum`：当前内容校验；
- `requestId`：写请求幂等键。

页面默认只读。写权限必须在 AI 调试区可见开启；API metadata 标记 `requiresConfirm` 的命令进入页面待批准状态，批准后才调用公开 API。所有方法通过实际 `window.webglGeneratorApi` 的白名单解析，不接受属性路径逃逸、函数源码、任意 JS 或内部 map 路径。

刷新时旧 pageSession / sessionToken / inspectionToken 失效。若 sessionStorage 保存“本次浏览器会话恢复”，启动壳才动态加载主模块并重新配对；自动恢复仅只读，写权限和待批准命令清空。地图替换时 documentId 改变并拒绝旧任务。

## 第 228 项架构

无头写会话拥有迁移后的内存地图、稳定 documentId、单调 revision、requestId 结果表、事务快照和受支持领域宿主。每个动作遵守：

1. inspector 生成规范输入、影响摘要、revision 和 inspectionToken；
2. execute 校验 token、输入指纹、documentId、expectedRevision 和确认；
3. 在事务快照上调用共享领域命令；
4. 成功后递增 revision、记录摘要并使必要派生系统过期或重建；
5. 失败恢复完整快照；
6. 保存默认要求新输出路径，输入文件哈希保持不变。

第一批只迁移能在无 DOM 环境中可靠验收的代表动作：人口调整、高度选区平滑和一个低风险对象编辑。其它浏览器 API 返回 `headless_method_unsupported`，不得静默裸改字段。

## 统一验收

- 第 227 项验证普通首屏不加载主 chunk、视觉开启、只读查询、低风险写入、确认、高风险拒绝、刷新恢复和断开。
- 第 228 项验证 JSON / gzip / v1 迁移、三类写入、幂等、revision、回滚、输入不变、输出重读和浏览器导入。
- 每项验收后独立中文提交；中途不推送，第 228 项完成后统一推送。
