# Tasks

- [ ] Task 1: 调整商品类型与服务层
  - [ ] SubTask 1.1: 在 `src/services/items.ts` 将 `ItemCreateRequest.images` 与 `ItemPatchRequest.images` 类型改为 `File[]`
  - [ ] SubTask 1.2: 实现 `buildItemFormData(payload)` 工具函数：将文本字段以普通表单字段写入 `FormData`，`images` 数组以 `formData.append('images', file)` 重复追加，未传 `images` 时不写入该字段；`undefined`/空字符串字段跳过
  - [ ] SubTask 1.3: 改造 `createItem` / `updateItem` 走 `FormData`，强制 `Content-Type: multipart/form-data`（让浏览器自动带 boundary，仅在 axios 中删除默认 `Content-Type` 即可），保留鉴权拦截

- [ ] Task 2: 校验调用方与表单层
  - [ ] SubTask 2.1: 排查 `src/modules/items/form-page.tsx` 等调用方，确保提交的 `images` 全部为 `File`（来自 `originFile`），而非 URL 字符串
  - [ ] SubTask 2.2: 编辑页明确：未选择图片时不带 `images` 字段；选择后会替换原图片；UI 文案与后端契约一致

- [ ] Task 3: 验收
  - [ ] SubTask 3.1: `npm run typecheck` 通过
  - [ ] SubTask 3.2: `npm run build` 通过
  - [ ] SubTask 3.3: 人工检查：创建商品（带 / 不带图）、更新商品（带 / 不带图）四种场景的请求 Content-Type 为 `multipart/form-data`，且 images 仅在选择时出现

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1] and [Task 2]
