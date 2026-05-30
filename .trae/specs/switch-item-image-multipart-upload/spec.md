# 商品图片二进制上传适配 Spec

## Why
后端商品创建 / 更新接口的图片字段已从「JSON URL 数组」调整为 `multipart/form-data` 二进制文件上传（详见 `docs/商品图片上传接口更新.openapi.json`）。前端 `src/services/items.ts` 当前仍以 JSON 形式提交 `images: string[]`，与后端不再兼容，需要同步调整为二进制文件上传。

## What Changes
- 调整 `src/services/items.ts` 中 `createItem` / `updateItem` 的请求方式为 `multipart/form-data`，并按重复 `images` 字段提交多份二进制文件。
- 调整 `ItemCreateRequest` / `ItemPatchRequest` 类型，将 `images` 字段从 `string[]` 改为 `File[]`；`Item.images` 仍保留为后端返回的 URL 数组。
- 表单层 `src/modules/items/form-page.tsx` 沿用 Arco `Upload` 组件，需要确认 `originFile` 直传给服务层，无 URL 字符串混入。
- 创建商品时若未选择图片则不附带 `images` 字段；更新商品时未选择新图片则不带 `images`，保留原图片。
- **BREAKING**：服务层方法签名 `images?: File[]` 替代原 `images?: string[]`，调用方需要传文件而非 URL。

## Impact
- Affected specs:
  - `build-merchant-auction-console`：商品创建 / 编辑能力字段类型
- Affected code:
  - `src/services/items.ts`
  - `src/modules/items/form-page.tsx`（确认入参，无明显改动）
  - 任何对 `ItemCreateRequest.images` / `ItemPatchRequest.images` 直接传 URL 数组的代码（需排查）

## ADDED Requirements

### Requirement: 商品图片二进制上传
The system SHALL submit item images as `multipart/form-data` binary files when creating or updating items.

#### Scenario: 创建商品携带图片
- **WHEN** 商家在创建商品表单选择 N 张本地图片并提交
- **THEN** 前端使用 `multipart/form-data` 调用 `POST /api/v1/items`
- **AND** 文本字段以普通表单字段提交，`images` 字段以重复 `images` File 提交 N 次
- **AND** 不再提交 JSON `images: string[]`

#### Scenario: 创建商品不带图片
- **WHEN** 商家未选择任何图片
- **THEN** 前端依然使用 `multipart/form-data`，但不附带 `images` 字段
- **AND** 后端按默认空数组处理

#### Scenario: 更新商品时替换图片
- **WHEN** 商家在编辑表单选择新图片并提交
- **THEN** 前端使用 `multipart/form-data` 调用 `PATCH /api/v1/items/{id}`，`images` 文件字段携带新选择的 N 个文件
- **AND** 后端将原图片替换为新图片

#### Scenario: 更新商品时保留原图片
- **WHEN** 商家在编辑表单未选择任何新图片
- **THEN** 前端使用 `multipart/form-data` 调用 `PATCH /api/v1/items/{id}`，但不附带 `images` 字段
- **AND** 后端保留原图片不变

## MODIFIED Requirements

### Requirement: 商品创建表单
商品创建表单字段保持不变，但「商品图片」字段提交方式由 JSON URL 数组调整为二进制文件多文件上传。Upload 组件 `autoUpload={false}` + `originFile` 透传给服务层。

### Requirement: `ItemCreateRequest` / `ItemPatchRequest` 类型
`images` 字段由 `string[]` 修改为 `File[]`。`Item.images` 响应类型继续保持 `string[]`（后端返回访问 URL）。

## REMOVED Requirements
本次不删除任何已存在能力。
