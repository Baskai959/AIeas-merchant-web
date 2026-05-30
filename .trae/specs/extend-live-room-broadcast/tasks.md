# Tasks

* [x] Task 1: 接入直播间 OpenAPI 类型与服务

  * [x] SubTask 1.1: 在 `src/services/liveRoom.ts` 新增 `LiveRoom` / `LiveRoomCreateRequest` / `LiveRoomPatchRequest` / `LiveRoomActivateRequest` 类型与 `listLiveRooms / getLiveRoom / createLiveRoom / patchLiveRoom / deleteLiveRoom / listLiveRoomLots / activateLiveRoomAuction / deactivateLiveRoomAuction` 调用

  * [x] SubTask 1.2: 在 `src/services/auction.ts` 中补充 `attachAuctionToLiveRoom / detachAuctionFromLiveRoom`，按 spec 的「后端待补接口」对接 `POST /api/v1/live-rooms/{id}/lots` 与 `DELETE /api/v1/live-rooms/{id}/lots/{auctionId}`，并对 404 / 501 类响应做降级提示

  * [x] SubTask 1.3: 在 `src/store/liveRoom.ts` 提供当前直播间、挂载列表与待上架列表三个 selector，封装挂载、移除、激活、释放等异步动作

* [x] Task 2: 实现直播间列表与开播管理页

  * [x] SubTask 2.1: 新增菜单「直播间」，对应路由 `/live-rooms`，复用 `PageContainer`

  * [x] SubTask 2.2: 列表页支持创建直播间（标题、描述、封面）、状态筛选（OFFLINE/LIVE/CLOSED）、分页

  * [x] SubTask 2.3: 行内提供「开播 / 下播 / 进入控场 / 编辑 / 删除」操作；下播流程需先 `deactivate` 再 `PATCH status=OFFLINE`，操作携带 `Idempotency-Key`

* [x] Task 3: 实现直播间工作台

  * [x] SubTask 3.1: 新增路由 `/live-rooms/:id/workbench`，头部展示直播间标题、状态、`activeAuctionId` 与「开播 / 下播 / 进入控场」操作

  * [x] SubTask 3.2: 主体提供「直播商品 / 待上架商品」Tab；前者数据来自 `listLiveRoomLots`，后者来自筛选 `liveRoomId == 0` 的 `listAuctions`

  * [x] SubTask 3.3: 「待上架商品」支持搜索、分页、批量「上架到当前直播间」（调用挂载接口）

  * [x] SubTask 3.4: 「直播商品」支持「开拍 / 取消讲解 / 下架 / 进入控场」；开拍调用 `activateLiveRoomAuction`，取消讲解调用 `deactivateLiveRoomAuction`，下架调用「移出直播间」接口；同一房间最多一个 `RUNNING`，开拍按钮按互斥规则置灰

* [x] Task 4: 抽取直播商品卡片组件与图片兜底

  * [x] SubTask 4.1: 新增 `src/components/SafeImage`，支持 `src` / `fallback` / `alt` / `onError` 防重复触发，并提供默认占位图资源

  * [x] SubTask 4.2: 新增 `src/components/AuctionLotCard`，按参考图实现序号、图片 + 状态徽标、标题、ID、标签链、卖点提示、5 列价格 / 数量信息、底部按钮组

  * [x] SubTask 4.3: 在直播间工作台两个 Tab 中复用该卡片，根据 Tab 切换状态徽标与按钮组合

* [x] Task 5: 串联控场页与直播间 WebSocket

  * [x] SubTask 5.1: `src/services/socket.ts` 增加 `connectLiveRoom(roomId, lastSeq?)`，建立 `/ws/live-rooms/{room_id}` 连接

  * [x] SubTask 5.2: 控场页改造为 `/live-rooms/:id/control`，依据 `activeAuctionId` 拉取拍品详情与实时状态；房间无在拍品（HTTP/WS 409）时显示「等待开拍」空态

  * [x] SubTask 5.3: 直播间列表与工作台「进入控场」均跳到该新路由，旧 `/auctions/:id/control` 入口在过渡期保留并打上「即将废弃」标记

* [x] Task 6: 拍品模块联动调整

  * [x] SubTask 6.1: 拍品列表移除「开拍 / 取消 / 落锤」操作，改为「编辑 / 详情 / 挂入直播间 / 移出直播间」

  * [x] SubTask 6.2: 拍品详情顶部显示当前所属直播间链接；若拍品未挂载，提供「选择直播间挂入」入口

  * [x] SubTask 6.3: 校验：仅 `READY` 状态拍品可挂入；未挂入拍品不显示「开拍」入口

* [x] Task 7: 验收与降级体验

  * [x] SubTask 7.1: 验证「创建直播间 → 开播 → 挂载拍品 → 开拍 → 落锤 → 下播」主链路

  * [x] SubTask 7.2: 验证「同房间同时刻只一个拍品在拍」与按钮互斥

  * [x] SubTask 7.3: 验证图片加载失败兜底、空态、未开播态、未上架态、后端待补接口未上线时的降级提示

  * [x] SubTask 7.4: `pnpm run typecheck` 与 `pnpm run build` 通过

# Task Dependencies

* \[Task 2] depends on \[Task 1]

* \[Task 3] depends on \[Task 1] and \[Task 2] and \[Task 4]

* \[Task 4] depends on \[Task 1]

* \[Task 5] depends on \[Task 1] and \[Task 2]

* \[Task 6] depends on \[Task 1]

* \[Task 7] depends on \[Task 2], \[Task 3], \[Task 4], \[Task 5], \[Task 6]

# Parallel Notes

* `Task 4` 卡片与 `SafeImage` 组件可在 `Task 1` 完成后与 `Task 2` 并行推进

* `Task 5` 控场链路改造可在 `Task 2` 完成后与 `Task 3` 并行推进

* `Task 6` 拍品模块调整可在 `Task 1` 完成后并行推进
