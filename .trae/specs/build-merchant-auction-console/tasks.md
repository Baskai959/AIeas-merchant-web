# Tasks
- [x] Task 1: 重构应用骨架与业务导航
  - [x] SubTask 1.1: 盘点并替换现有演示路由、菜单、默认首页，建立商家端业务信息架构
  - [x] SubTask 1.2: 规划 `modules`、`services`、`store`、`components` 目录职责，避免页面逻辑散落在模板文件
  - [x] SubTask 1.3: 定义通用页面容器、空态、错误态、权限守卫与面包屑策略

- [x] Task 2: 建立认证与 API 基础设施
  - [x] SubTask 2.1: 封装 HTTP 客户端、统一响应解包、全局错误提示与请求 Loading
  - [x] SubTask 2.2: 实现登录、登出、获取当前用户、令牌刷新与登录态持久化
  - [x] SubTask 2.3: 建立以 Zustand 为核心的会话状态与通用查询状态，替换模板中的 Redux 业务依赖

- [x] Task 3: 交付商品管理模块
  - [x] SubTask 3.1: 按 `ItemCreateRequest` 实现商品创建表单与字段校验
  - [x] SubTask 3.2: 实现商品列表页，支持状态/类目筛选、分页、状态展示
  - [x] SubTask 3.3: 实现商品详情或编辑回显能力，为拍品创建提供商品选择基础

- [x] Task 4: 交付拍品管理模块
  - [x] SubTask 4.1: 按 `AuctionCreateRequest` 实现拍品创建表单，覆盖 0 元起拍、保留价、加价规则、保证金、anti-sniping、起止时间
  - [x] SubTask 4.2: 实现拍品列表页，展示业务状态与开拍/编辑/查看等操作
  - [x] SubTask 4.3: 实现拍品详情与规则编辑页，严格限制仅未开拍状态可修改

- [x] Task 5: 交付实时控场主链路
  - [x] SubTask 5.1: 封装竞拍房间实时连接层，支持连接、重连、订阅、退订、心跳与事件分发
  - [x] SubTask 5.2: 实现控场页状态聚合，整合详情接口、实时状态接口与 WebSocket 事件
  - [x] SubTask 5.3: 实现当前价、领先用户、TopN 榜单、倒计时、anti-sniping 提示与连接状态反馈
  - [x] SubTask 5.4: 实现开拍、异常取消、手工落锤三类关键操作，统一使用 `Idempotency-Key`

- [x] Task 6: 交付订单与日志模块
  - [x] SubTask 6.1: 实现订单列表与详情页，支持状态筛选与成交信息展示
  - [x] SubTask 6.2: 对接审计日志接口或降级方案，展示操作人、动作、对象、时间与摘要
  - [x] SubTask 6.3: 为无权限或接口不可用场景提供清晰提示，不阻塞其他模块使用

- [x] Task 7: 质量保障与验收
  - [x] SubTask 7.1: 为关键数据映射、状态切换和高风险交互补充必要的单元或集成验证
  - [x] SubTask 7.2: 验证登录、商品创建、拍品创建、开拍、控场、落锤、查单主链路
  - [x] SubTask 7.3: 校验断线重连、错误态、空态、权限受限与幂等重复点击场景

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 2] and [Task 3]
- [Task 5] depends on [Task 2] and [Task 4]
- [Task 6] depends on [Task 2]
- [Task 7] depends on [Task 3], [Task 4], [Task 5], and [Task 6]

# Parallel Notes
- `Task 3` 与 `Task 6` 可在 `Task 2` 完成后并行推进
- `Task 5.1` 可在 `Task 4` 进行期间并行准备，但 `Task 5.2` 之后依赖拍品详情与状态模型稳定
