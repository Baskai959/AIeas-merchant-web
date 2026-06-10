# AIeas Merchant Web

AIeas 商家端竞拍后台，面向商家直播拍卖运营场景。项目覆盖拍品管理、直播场次、控场、订单、操作日志、AI 助手与直播总结报告等后台工作流。

## 技术栈

- React 17
- TypeScript
- Vite
- Arco Design React
- Zustand
- Axios
- Less

## 本地环境

推荐使用 `pnpm` 安装和运行项目。

```bash
pnpm install
pnpm dev
```

开发服务默认监听：

```text
http://127.0.0.1:3030
```

本地开发时，Vite 会把接口代理到后端服务：

```text
HTTP API: http://127.0.0.1:8888
WebSocket: ws://127.0.0.1:8888
```

启动前请确认后端服务已在 `8888` 端口运行，否则登录、拍品发布、控场实时数据等功能无法正常使用。

## 常用命令

```bash
pnpm dev          # 启动本地开发服务
pnpm build        # 生产构建
pnpm preview      # 预览生产构建产物
pnpm typecheck    # TypeScript 类型检查
pnpm eslint       # ESLint 检查并自动修复
pnpm stylelint    # Less/CSS 样式检查并自动修复
```

## 目录说明

```text
src/
  components/          通用业务组件
  layout.tsx           后台整体布局
  modules/
    auctions/          拍品管理、创建编辑、详情
    live-sessions/     直播场次、工作台、控场、直播记录
    orders/            成交订单
    audit-logs/        操作日志
  pages/               路由页面入口
  services/            HTTP、WebSocket 与业务 API 封装
  store/               会话和业务状态
  utils/               通用工具
docs/                  API 文档与需求记录
```

## 主要功能

- 商家登录与会话管理
- 拍品创建、编辑、图片上传、规则配置和状态流转
- 直播场次管理、开播前配置、封面上传和标题设置
- 直播控场、预约开拍、取消讲解、手工落锤和实时竞拍动态
- 成交订单查询和状态展示
- AI 托管开关、AI 助手事件展示和直播总结报告

## 开发约定

- 前端接口封装集中放在 `src/services`。
- 页面级业务逻辑优先放在对应 `src/modules/*` 下。
- 新增接口或后端问题记录可补充到 `docs/`。
- 提交前至少运行 `pnpm typecheck`；涉及样式或构建链路时同步运行 `pnpm build`。
