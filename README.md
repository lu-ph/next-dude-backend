# WebSocket 接口文档

## 连接

- 地址：`ws://<host>:8080/ws`
- 局域网访问时，将 `<host>` 替换为运行后端电脑的 IPv4 地址，例如 `ws://192.168.0.175:8080/ws`。
- 服务端默认监听 `0.0.0.0`，会开放所有网卡；可通过环境变量 `HOST` 和 `PORT` 覆盖监听地址和端口。
- 最大消息大小：20 MB
- 所有业务消息均为 JSON 字符串，格式如下：

```json
{
  "type": "消息类型",
  "id": "可选请求 ID",
  "payload": {}
}
```

服务端每 30 秒发送一次 WebSocket `ping`。客户端应正常响应 `pong`，否则连接可能被关闭。

## 客户端 -> 服务端

### 创建会话

`agent:create_session`

单条 JSON 消息创建会话并提交第一条问题、一个 PDF 和图片数组。文件内容均使用 Base64 字符串。

```json
{
  "type": "agent:create_session",
  "id": "request-001",
  "payload": {
    "prompt": "请分析这个 PDF，并结合图片回答",
    "pdf": {
      "filename": "report.pdf",
      "data": "JVBERi0xLjQKJ..."
    },
    "images": ["iVBORw0KGgoAAAANSUhEUg..."]
  }
}
```

服务端会先返回：

```json
{
  "type": "agent:session_created",
  "id": "request-001",
  "payload": { "sessionId": "生成的会话 ID" }
}
```

然后通过 `agent:text_delta` 和 `agent:final` 流式返回第一条 AI 回复。

### 发起对话

`agent:chat_request`

```json
{
  "type": "agent:chat_request",
  "payload": {
    "prompt": "请帮我分析这个 PDF",
    "sessionId": "可选，会话 ID",
    "images": ["图片 Base64 字符串"]
  }
}
```

`prompt` 不能为空。后续对话应使用 `agent:session_created` 返回的 `sessionId`。
`images` 可选，支持后续对话继续附带图片。

### 中断对话

`agent:chat_interrupt`

```json
{
  "type": "agent:chat_interrupt",
  "payload": {
    "reason": "用户取消"
  }
}
```

## 服务端 -> 客户端

### 增量文本

`agent:text_delta`

```json
{
  "type": "agent:text_delta",
  "payload": {
    "sessionId": "生成的会话 ID",
    "text": "回复内容片段"
  }
}
```

实际响应中的 `payload` 还包含当前会话的 `sessionId`。

### 对话完成

`agent:final`

```json
{
  "type": "agent:final",
  "payload": {
    "sessionId": "生成的会话 ID",
    "success": true
  }
}
```

### 系统消息

`agent:system`

```json
{
  "type": "agent:system",
  "payload": { "message": "Interrupted successfully" }
}
```

### 错误

`agent:error`

```json
{
  "type": "agent:error",
  "payload": {
    "error": "Invalid protocol frame",
    "code": "可选错误码"
  }
}
```

收到非法 JSON 或不符合协议的消息时，服务端返回错误消息，不执行该请求。

## 当前未接入的协议

代码中已定义 `pdf:*` 消息类型，但当前 `/ws` 路由的客户端校验未包含 PDF 消息，暂不能通过该接口使用 PDF 协议。
