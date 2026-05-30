# 商家端竞拍后台 Spec

## Why
现有项目仍是 Arco Design Pro 的演示后台骨架，路由、状态管理和业务页面与商家/主播端竞拍业务不匹配，无法支撑从商品上架到实时控场和成交查看的完整链路。需要基于需求文档与 OpenAPI，定义一套可直接指导前端改造实施的规格，确保 3 周 MVP 具备可登录、可配置、可开拍、可控场、可落锤、可查单的能力。

## What Changes
- 将现有演示路由改造为商家端业务路由，覆盖登录鉴权、商品管理、拍品管理、实时控场、订单查看、操作日志。
- 新增统一 API 客户端层，按 OpenAPI 对接认证、商品、拍品、订单与审计日志接口，并统一处理 Token、刷新、错误提示与空态。
- 将全局业务状态收敛为以 Zustand 为核心的前端状态模型，覆盖登录态、拍品列表筛选、实时控场状态、Socket 连接状态。
- 新增拍品实时控场链路：开拍、实时状态查询、WebSocket 房间订阅、倒计时同步、TopN 榜单、异常取消、手工落锤。
- 为商品、拍品、订单、日志页面定义与 API 字段对齐的数据映射、状态枚举、表单校验和只读边界。
- 补充 MVP 范围内的页面级加载、错误、空态、权限守卫与关键操作确认交互。
- **BREAKING**: 现有 `dashboard` / `example` 演示导航将被商家端业务导航替换。
- **BREAKING**: 现有基于 Redux 的模板状态依赖将迁移为以 Zustand 为主的业务状态实现。

## Impact
- Affected specs: 登录鉴权、商品管理、拍品管理、实时控场、成交订单、操作日志、全局布局与路由、实时通信
- Affected code: `src/routes.ts`、`src/layout.tsx`、`src/store/*`、`src/pages/*`、`src/components/*`、`src/utils/*`、新增 `src/modules/*`、新增 `src/services/*`

## ADDED Requirements
### Requirement: 商家端业务框架
系统 SHALL 提供面向商家 / 主播 / 运营角色的 PC 管理后台信息架构，并将主导航组织为登录鉴权、商品管理、拍品管理、实时控场、成交订单、操作日志六类核心能力。

#### Scenario: 登录后进入业务首页
- **WHEN** 商家或主播使用有效账号登录系统
- **THEN** 系统显示商家端业务导航，而不是演示模板导航
- **THEN** 默认进入拍卖业务相关首页，并展示当前用户身份信息

### Requirement: 登录鉴权与会话续期
系统 SHALL 对接 `/api/v1/auth/login`、`/api/v1/auth/me`、`/api/v1/auth/refresh`、`/api/v1/auth/logout`，支持 merchant / admin 角色登录、登录态持久化、失效后自动刷新、刷新失败后安全退出。

#### Scenario: 商家成功登录
- **WHEN** 用户提交 `account`、`password`、`role=merchant`
- **THEN** 系统保存 `accessToken`、`refreshToken`、`expiresIn` 和当前用户信息
- **THEN** 后续受保护请求自动携带 Bearer Token

#### Scenario: 访问令牌过期
- **WHEN** 受保护接口返回鉴权失效且本地存在 `refreshToken`
- **THEN** 系统自动调用刷新接口获取新 `accessToken`
- **THEN** 原始请求在刷新成功后重试一次
- **THEN** 刷新失败时清空本地会话并跳转登录页

### Requirement: 商品管理
系统 SHALL 提供商品创建、列表查询和详情回显能力，并与 `/api/v1/items`、`/api/v1/items/{id}` 对齐；表单字段至少覆盖标题、类目、品牌、成色、图片、描述、状态。

#### Scenario: 创建商品
- **WHEN** 用户填写商品标题与类目，并可选填写品牌、成色、图片、描述、状态
- **THEN** 系统按 `ItemCreateRequest` 结构提交
- **THEN** 创建成功后反馈成功提示并返回列表或详情页

#### Scenario: 浏览商品列表
- **WHEN** 用户按类目、状态筛选并分页查询
- **THEN** 系统调用商品列表接口并展示 `Item` 列表
- **THEN** 列表展示状态、创建时间、更新时间与可执行操作

### Requirement: 拍品管理
系统 SHALL 提供基于商品创建拍品、拍品列表、拍品详情、未开拍规则修改能力，并与 `/api/v1/auctions`、`/api/v1/auctions/{id}` 对齐。

#### Scenario: 创建 0 元起拍拍品
- **WHEN** 用户选择商品并填写起拍价、保留价、加价规则、anti-sniping、保证金、开始时间、结束时间
- **THEN** 系统允许 `startPrice=0`
- **THEN** 系统按 `AuctionCreateRequest` 提交并保存为草稿或待开拍状态

#### Scenario: 修改未开拍规则
- **WHEN** 用户打开状态为 `DRAFT`、`PENDING_AUDIT`、`READY` 或 `WARMING_UP` 的拍品编辑页
- **THEN** 系统允许修改 `AuctionPatchRequest` 中的可编辑规则字段
- **THEN** 系统禁止修改已进入 `RUNNING`、`EXTENDED`、`HAMMER_PENDING`、`CLOSED_*`、`SETTLED` 状态的拍品规则

### Requirement: 开拍与幂等操作
系统 SHALL 提供开拍、取消异常竞拍、手工落锤三类关键操作，并在调用 `/api/v1/auctions/{id}/start`、`/cancel`、`/hammer` 时传递 `Idempotency-Key`。

#### Scenario: 一键开拍
- **WHEN** 用户在拍品列表或详情页点击开拍并确认
- **THEN** 系统生成唯一 `Idempotency-Key` 调用开拍接口
- **THEN** 成功后跳转或进入该拍品的实时控场面板

#### Scenario: 手工落锤
- **WHEN** 用户在控场页点击落锤并填写落锤原因后确认
- **THEN** 系统生成唯一 `Idempotency-Key` 调用落锤接口
- **THEN** 系统展示落锤结果、成交信息或失败提示

#### Scenario: 取消异常竞拍
- **WHEN** 用户在控场页或详情页执行异常取消并填写原因
- **THEN** 系统生成唯一 `Idempotency-Key` 调用取消接口
- **THEN** 系统记录原因并刷新拍品状态

### Requirement: 实时控场面板
系统 SHALL 提供拍品实时控场页，综合使用 `/api/v1/auctions/{id}`、`/api/v1/auctions/{id}/state` 与竞拍房间 WebSocket，展示当前价、领先用户、TopN 出价榜、剩余时间、在线状态、anti-sniping 提示和关键事件流。

#### Scenario: 进入控场页
- **WHEN** 用户打开某个拍品的实时控场面板
- **THEN** 系统先拉取拍品详情与实时状态快照
- **THEN** 系统订阅对应房间并开始接收 `auction.started`、`bid.accepted`、`ranking.updated`、`timer.tick`、`timer.extended`、`auction.closed`、`order.created`

#### Scenario: 倒计时延长
- **WHEN** 收到 `timer.extended` 事件或状态快照中的结束时间变化
- **THEN** 系统按服务端时间重新校准剩余时间
- **THEN** 页面提示 anti-sniping 已触发及延长秒数

#### Scenario: 断线恢复
- **WHEN** WebSocket 断开后重连成功
- **THEN** 系统自动重新订阅当前拍品房间
- **THEN** 系统重新拉取拍品状态快照，避免仅依赖事件重放

### Requirement: 成交订单查看
系统 SHALL 提供订单列表与订单详情查看能力，并与 `/api/v1/orders`、`/api/v1/orders/{id}` 对齐，展示成交价、中标用户、保证金金额、订单状态、支付状态和关键时间。

#### Scenario: 查看成交订单
- **WHEN** 商家在订单页按订单状态或支付状态筛选
- **THEN** 系统展示与当前商家售出订单对应的 `OrderDeal` 列表
- **THEN** 用户可进入详情查看成交信息与支付进度

### Requirement: 操作日志与审计可见性
系统 SHALL 提供操作日志列表，优先对接可用的审计日志接口，并最少展示操作人、动作、目标类型、目标 ID、时间与载荷摘要。

#### Scenario: 查询操作日志
- **WHEN** 当前账号具备可访问审计日志接口的权限
- **THEN** 系统调用 `/api/v1/admin/audit-logs` 获取日志
- **THEN** 页面支持按操作人、动作和时间范围筛选

#### Scenario: 无权限查看日志
- **WHEN** 当前账号无权访问审计日志接口
- **THEN** 系统展示明确的无权限或不可用提示
- **THEN** 不得出现白屏或无限重试

### Requirement: MVP 交互质量
系统 SHALL 为所有核心页面提供统一的加载、空态、错误态与操作反馈，确保后端失败、接口为空或实时连接中断时界面可恢复、可理解。

#### Scenario: 接口失败
- **WHEN** 任一列表页、表单页或控场页接口调用失败
- **THEN** 系统展示明确错误提示与重试入口
- **THEN** 页面主体结构保持可见，不得出现白屏

## MODIFIED Requirements
### Requirement: 应用框架与技术栈
系统 SHALL 将当前基于 Arco Design Pro 的演示项目调整为满足需求文档约束的商家端实现；前端使用 TypeScript，保留 Arco 组件体系，并以 Zustand 作为全局业务状态方案，替代模板中的 Redux 业务依赖。

### Requirement: 路由与页面组织
系统 SHALL 不再以 `dashboard/workplace` 和 `example` 作为主要业务入口，而是按 `auth`、`item`、`auction`、`live-control`、`order`、`audit-log` 等能力组织页面与导航。

## REMOVED Requirements
### Requirement: 演示型后台页面
**Reason**: 现有工作台、示例页与本次商家端拍卖后台目标无直接业务关系，会干扰 MVP 交付。
**Migration**: 以商家端业务路由替换原入口；若保留模板能力，仅作为内部开发示例，不出现在正式导航中。
