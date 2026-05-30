# 直播间开播与拍品挂载 Spec

## Why
现有商家端可创建拍品并在控场页直接开拍，但缺少「直播间」承载，无法满足「先开播 → 选商品入直播间 → 再开拍 → 同房间同时刻只能一个拍品在拍」的业务流程。同时商品展示样式较朴素，需要参考产品图给出统一的卡片式直播商品列表与图片降级方案。

## What Changes
- 新增「直播间」一级菜单与开播工作台，覆盖创建直播间、上播 / 下播、查看与管理。
- 直播间工作台包含「直播商品 / 待上架商品」两个 Tab，支持把已创建的拍品挂载到直播间，未上架前不允许开拍。
- 拍品「开拍 / 下拍」入口由原拍品列表迁移到「直播间工作台」，并通过 `POST /api/v1/live-rooms/{id}/activate`、`POST /api/v1/live-rooms/{id}/deactivate` 调用，保证「同一直播间同一时刻只有一个拍品在拍」。
- 控场页改为基于直播间 + 当前在拍 `auctionId` 的视图，订阅 `/ws/live-rooms/{room_id}`。
- 新增统一的商品卡片组件（参考产品图），固定列：图片（含失败兜底）、标题、ID、标签、起拍价、固定加价、封顶价、当前出价 / 成交金额、出价次数、状态、操作按钮。
- **BREAKING**：原拍品列表上「开拍 / 取消 / 落锤」按钮拆分到「直播间工作台」承担，拍品列表只保留「编辑 / 详情 / 挂入直播间 / 移出直播间」。

## Impact
- Affected specs:
  - `build-merchant-auction-console`：拍品列表交互、控场页入口
- Affected code:
  - `src/routes.ts`、`src/components/Layout`、菜单与面包屑配置
  - `src/modules/auction/*`、`src/modules/live-control/*`
  - 新增 `src/modules/live-room/*`、`src/services/liveRoom.ts`、`src/store/liveRoom.ts`
  - 新增 `src/components/AuctionLotCard`、`src/components/SafeImage`
  - `src/services/socket.ts`：补充直播间房间订阅链接
  - `src/services/auction.ts`：补充挂入 / 移出直播间能力（依赖后端补接口）

## ADDED Requirements

### Requirement: 直播间管理
The system SHALL allow merchants to create, list, edit, broadcast (online) and close their live rooms.

#### Scenario: 创建并开播
- **WHEN** 商家在「直播间」页面点击「新建直播间」并提交标题、描述、封面
- **THEN** 调用 `POST /api/v1/live-rooms` 创建，并在列表中显示状态 `OFFLINE`
- **AND** 商家点击「开播」，前端调用 `PATCH /api/v1/live-rooms/{id}` 将 `status` 更新为 `LIVE`，房间进入开播态

#### Scenario: 下播
- **WHEN** 商家点击「下播」
- **THEN** 若当前 `activeAuctionId != 0`，先调 `POST /api/v1/live-rooms/{id}/deactivate` 释放在拍锁，再 `PATCH status=OFFLINE`
- **AND** 操作携带 `Idempotency-Key`

### Requirement: 直播商品挂载
The system SHALL allow merchants to attach existing auctions to a live room before any of them can be activated.

#### Scenario: 挂载待上架商品
- **WHEN** 商家在「待上架商品」Tab 选中已有 `READY` 拍品并点击「上架到直播间」
- **THEN** 前端调用 `POST /api/v1/live-rooms/{id}/lots`（详见 [#后端待补接口]）将拍品挂到当前直播间
- **AND** 列表自动刷新，目标拍品出现在「直播商品」Tab

#### Scenario: 移出直播间
- **WHEN** 商家在「直播商品」点击「下架」
- **THEN** 拍品当前不在拍（`activeAuctionId != auctionId`）时，调用 `DELETE /api/v1/live-rooms/{id}/lots/{auctionId}`（详见 [#后端待补接口]）将拍品移回待上架
- **AND** 若拍品正在拍，「下架」按钮置灰并提示「请先结束当前拍卖」

### Requirement: 单拍品互斥开拍
The system SHALL ensure that within one live room only one auction can be running at any given time.

#### Scenario: 一键开拍
- **WHEN** 直播间状态为 `LIVE` 且 `activeAuctionId == 0`，商家在「直播商品」点击某个 `READY` 拍品的「开拍」
- **THEN** 前端调用 `POST /api/v1/live-rooms/{id}/activate`，请求体 `{ "auctionId": <id> }`，并携带 `Idempotency-Key`
- **AND** 成功后该拍品状态切换为 `RUNNING`，卡片显示「竞拍中」与倒计时
- **AND** 同列表其他 `READY` 拍品的「开拍」按钮被置灰

#### Scenario: 取消讲解 / 结束当前拍
- **WHEN** 当前在拍拍品需要中止
- **THEN** 前端调用 `POST /api/v1/live-rooms/{id}/deactivate`（携带 `Idempotency-Key`）
- **AND** 成功后房间 `activeAuctionId` 置 0，所有 `READY` 拍品的「开拍」按钮恢复

#### Scenario: 直播未开播禁止开拍
- **WHEN** 直播间状态为 `OFFLINE` 或 `CLOSED`
- **THEN** 所有「开拍」按钮置灰并提示「请先开播」

### Requirement: 直播商品卡片视觉
The system SHALL render auction lots inside a live room with the unified card layout shown in the reference UI, and SHALL gracefully fall back to a default image when the product image fails to load.

#### Scenario: 卡片信息展示
- **WHEN** 列表渲染一个挂载在直播间的拍品
- **THEN** 卡片左侧展示序号、商品图片 + 状态徽标（讲解中 / 已成交 等）；中部展示标题、ID、标签（晚发即赔 / 包退 / 运费险 / 竞拍 等）、设置卖点的提示行；右侧依次展示「起拍价 / 固定加价 / 封顶价 / 当前出价 或 成交金额 / 出价次数」五个字段；底部提供「商品 / 竞拍中 / 下架 / 取消讲解 / 讲解 / 更多」操作组

#### Scenario: 图片加载失败兜底
- **WHEN** 商品主图请求失败（`onError`）或 `imageUrl` 为空
- **THEN** 自动替换为内置默认图（如 `/assets/default-product.png`），且不再无限重试同一个失败 URL

### Requirement: 直播间控场链路
The system SHALL connect the live-control panel to the live-room WebSocket and reflect the current activated auction.

#### Scenario: 进入控场页
- **WHEN** 商家点击直播间「进入控场」
- **THEN** 前端建立 `/ws/live-rooms/{roomId}` 连接（带 `token` 与 `lastSeq`）
- **AND** 控场页基于 `room.activeAuctionId` 拉取拍品详情、实时状态、TopN
- **AND** 房间无在拍品（WS 返回 409）时，前端切换为「等待开拍」空态而非报错

## MODIFIED Requirements

### Requirement: 拍品列表
拍品列表保留筛选、分页与状态展示，但「开拍 / 取消 / 落锤」操作迁移到「直播间工作台」。
拍品列表新增「挂入直播间 / 移出直播间」操作，用于在「待上架商品」与某个直播间之间转移拍品。

### Requirement: 实时控场入口
原从拍品列表「控场」按钮直达 `auctionId` 的入口替换为：先选择直播间，再由直播间路由到当前在拍 `auctionId`。

## REMOVED Requirements
本次不删除任何已存在能力。原「拍品列表 → 控场」入口在过渡期可保留，但不再是默认路径。

## 后端待补接口（前端预生成，待后端落地）

> 这些接口当前 OpenAPI 文档（`docs/默认模块.openapi.json`）尚未提供，前端按以下契约对接，落地前以 mock / 接口未上线提示降级。

### 1. 直播间挂载拍品
- **接口**：`POST /api/v1/live-rooms/{id}/lots`
- **角色**：merchant / admin（仅当前直播间所属商家）
- **请求体**：
  ```json
  { "auctionId": 12345 }
  ```
- **响应 200**：
  ```json
  {
    "code": 0,
    "message": "ok",
    "data": { "lot": { "...AuctionLot..." } }
  }
  ```
- **错误**：
  - 400：参数缺失
  - 403：拍品不属于当前商家
  - 404：直播间或拍品不存在
  - 409：拍品已挂入其他直播间 / 拍品状态非 `READY`

### 2. 直播间移除拍品
- **接口**：`DELETE /api/v1/live-rooms/{id}/lots/{auctionId}`
- **角色**：merchant / admin
- **响应 200**：
  ```json
  { "code": 0, "message": "ok", "data": { "removed": true } }
  ```
- **错误**：
  - 403：非当前直播间所属商家
  - 404：直播间或拍品不存在 / 拍品未挂载到该直播间
  - 409：拍品当前在拍（`activeAuctionId == auctionId`），需先 `deactivate`

### 3.（建议）拍品 PATCH 增加 `liveRoomId`
- **接口**：`PATCH /api/v1/auctions/{id}`
- **新增字段**：`liveRoomId`（uint64，0 表示移出）
- **作用**：作为方案 1/2 的简化替代；前端在「方案 1/2」未上线时可走该字段。

### 4.（可选）直播间统计
- **接口**：`GET /api/v1/live-rooms/{id}/stats`
- **响应**：在线人数、累计 PV、出价次数、当前在拍倒计时等聚合数据，用于直播工作台头部信息。
