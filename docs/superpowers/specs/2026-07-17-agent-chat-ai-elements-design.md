# Agent 管理页 AI 对话化改造 — 设计文档

## 目标

将 Agent 管理页（`/agents`）从传统 CRUD 表单风格改造为 AI 原生对话界面，引入 `ai-elements` 组件库，以 Mastra 官方 `@mastra/ai-sdk` 桥接 AI SDK，实现 Agent 对话测试功能。

## 范围

- **只改 `/agents` 页面**，其他页面不受影响
- 全局主题微调（3 项 CSS 增量），不动布局框架

## 方案：左侧面板 + 右侧对话区

### 布局

```
┌──────────────────────────────────────────────────┐
│                   Header (不变)                    │
├─────────────────┬────────────────────────────────┤
│   Agent List    │    Conversation                 │
│   ┌───────────┐ │    ┌──────────────────────────┐│
│   │opinionAgent│◀│    │ ConversationContent      ││
│   │ (选中高亮)  │ │    │  Message (user/assist)   ││
│   └───────────┘ │    │  ConversationScrollButton ││
│                 │    ├──────────────────────────┤│
│   Agent Detail  │    │  PromptInput              ││
│   flow / model  │    │  [输入...]  [发送/停止]   ││
│   instructions  │    └──────────────────────────┘│
└─────────────────┴────────────────────────────────┘
```

- **左侧 1/3**：Agent 列表（选中高亮）+ 可折叠配置信息（instructions、model、flow）
- **右侧 2/3**：Conversation + PromptInput（ai-elements 组件）
- **空状态**：未选中 Agent 时，右侧显示 "选择一个 Agent 开始对话"

### 组件树

```
page.tsx
├── AgentList        # 左侧 - 从 /api/agents 获取列表
├── AgentDetail      # 左侧 - agent 配置折叠面板
└── AgentChat        # 右侧 - 对话区（选中 agent 后渲染）
    ├── Conversation
    │   ├── ConversationContent
    │   │   ├── ConversationEmptyState   # 无消息时
    │   │   └── Message (×N)
    │   │       ├── MessageContent
    │   │       │   └── MessageResponse  # Markdown 渲染
    │   │       └── MessageActions       # copy 按钮（可选）
    │   └── ConversationScrollButton
    └── PromptInput
        ├── PromptInputBody
        │   └── PromptInputTextarea
        └── PromptInputFooter
            └── PromptInputSubmit
```

## 数据流

```
AgentChat (useChat)  ──POST /api/chat──►  chat route
     │                                        │
     │  { messages, agentKey }                │  mastra.getAgent(agentKey)
     │                                        │  agent.stream(messages)
     │  ◄── streaming response ──────────────  │
     │                                        │
     ▼                                        ▼
  Message[] 实时渲染                    @mastra/ai-sdk 桥接
```

### API 端点

**`POST /api/chat`**（新增）

- 请求体：`{ messages: UIMessage[], agentKey: string }`
- 逻辑：通过 `@mastra/ai-sdk` 适配器将 Mastra agent 包装为 AI SDK 兼容 model，调用 `streamText` 返回 stream
- 响应：AI SDK stream（`result.toUIMessageStreamResponse()`）

**`GET /api/agents`**（已有，不变）

### 依赖

| 包 | 用途 |
|---|---|
| `@mastra/ai-sdk` | Mastra → AI SDK 桥接 |
| `@ai-sdk/react` | `useChat` hook |
| `ai` | AI SDK 核心（`streamText`, `UIMessage`） |
| `ai-elements` | Conversation / Message / PromptInput 组件 |

## 主题微调

在 `globals.css` 中增量添加，不动现有变量：

1. **卡片阴影柔和化**：`.card-elevated` 使用已有 `--card-glow` 和 `--card-ring`
2. **消息气泡**：保持 ai-elements 默认（user = primary 实色，assistant = 无背景满宽）
3. **输入聚焦光晕**：`.prompt-focus-ring` 使用 `--ring` 半透明扩展

现有紫色主色调、布局、侧边栏、header 均不变。

## 实施要点

1. 先 `npx ai-elements@latest add conversation message prompt-input` 拉取组件到 `@/components/ai-elements/`
2. 安装 npm 依赖：`@mastra/ai-sdk @ai-sdk/react ai`
3. 新增 `/api/chat` route
4. 新建 `agent-list.tsx`、`agent-detail.tsx`、`agent-chat.tsx`
5. 重构 `page.tsx` 为双栏布局
6. 全局 CSS 微调
7. 现有运行历史模块可暂时移除或在详情中轻量展示
