# FastAPI WebSocket和RESTful API 文档

这是 FastAPI 服务器的 API 文档。该服务器提供了一个 WebSocket 接口用于与 Agent 实时交互，以及一些 HTTP RESTful API 用于管理会话和文件。

## 1. WebSocket API

### 端点: `/ws`

*   **方法**: WebSocket
*   **描述**:
    此端点用于客户端和 Agent 之间的实时双向通信。连接成功后，客户端可以初始化 Agent，发送查询，并接收 Agent 的响应、工具调用、错误信息等。
*   **查询参数**:
    *   `device_id` (string, 可选): 标识客户端设备的唯一 ID。此 ID 用于在 `create_agent_for_connection` 函数中关联会话。
*   **客户端发送的消息格式 (JSON)**:
    客户端发送的消息应为一个 JSON 对象，包含 `type` 和 `content` 字段。
    *   **初始化 Agent**:
        ```json
        {
            "type": "init_agent",
            "content": {
                "tool_args": {} // 可选，传递给工具的参数
            }
        }
        ```
    *   **发送查询**:
        ```json
        {
            "type": "query",
            "content": {
                "text": "用户输入的查询文本",
                "resume": false, // 可选，是否继续上一个任务
                "files": []      // 可选，附加的文件列表 (字符串路径)
            }
        }
        ```
    *   **请求工作区信息**:
        ```json
        {
            "type": "workspace_info",
            "content": {}
        }
        ```
    *   **Ping (心跳)**:
        ```json
        {
            "type": "ping",
            "content": {}
        }
        ```
    *   **取消当前查询**:
        ```json
        {
            "type": "cancel",
            "content": {}
        }
        ```
*   **服务器发送的消息格式 (JSON)**:
    服务器发送的消息遵循 `RealtimeEvent` 结构，通常包含 `type` (事件类型) 和 `content` (事件内容) 字段。
    *   `type`: `string` - 事件类型，例如：
        *   `CONNECTION_ESTABLISHED`: 连接成功建立。
            *   `content`: `{"message": "Connected to Agent WebSocket Server", "workspace_path": "工作区路径"}`
        *   `AGENT_INITIALIZED`: Agent 初始化完成。
            *   `content`: `{"message": "Agent initialized"}`
        *   `USER_MESSAGE`: 用户消息回显或记录。
            *   `content`: `{"text": "用户消息文本"}`
        *   `ASSISTANT_MESSAGE`: Agent 的回复。
            *   `content`: `{"text": "Agent 回复文本"}`
        *   `TOOL_CALL`: Agent 调用工具。
            *   `content`: (具体结构取决于工具)
        *   `TOOL_OUTPUT`: 工具执行结果。
            *   `content`: (具体结构取决于工具输出)
        *   `ERROR`: 发生错误。
            *   `content`: `{"message": "错误信息"}`
        *   `SYSTEM`: 系统消息。
            *   `content`: `{"message": "系统消息文本"}` (例如："Query canceled")
        *   `PROCESSING`: 服务器正在处理请求。
            *   `content`: `{"message": "Processing your request..."}`
        *   `WORKSPACE_INFO`: 对 `workspace_info` 请求的响应。
            *   `content`: `{"path": "当前工作区路径"}`
        *   `PONG`: 对 `ping` 请求的响应。
            *   `content`: `{}`
    *   `content`: `object` - 事件的具体内容，结构随 `type` 而变化。

## 2. HTTP RESTful API

### 2.1 上传文件

*   **端点**: `/api/upload`
*   **方法**: `POST`
*   **描述**: 上传单个文件到与指定会话关联的工作区内的 `uploads` 文件夹。如果文件名已存在，会自动添加后缀以避免覆盖。
*   **请求体 (JSON)**:
    ```json
    {
        "session_id": "string (会话的 UUID)",
        "file": {
            "path": "string (文件名，例如 'example.txt')",
            "content": "string (文件内容。对于二进制文件，应为 Base64 编码的 Data URL, 例如 'data:application/pdf;base64,...')"
        }
    }
    ```
*   **成功响应 (200 OK, JSON)**:
    ```json
    {
        "message": "File uploaded successfully",
        "file": {
            "path": "string (文件在会话 uploads 文件夹中的相对路径, 例如 '/uploads/example.txt')",
            "saved_path": "string (文件在服务器上的绝对存储路径)"
        }
    }
    ```
*   **错误响应 (JSON)**:
    *   `400 Bad Request`: `{"error": "session_id is required"}` 或 `{"error": "No file provided for upload"}` 或 `{"error": "File path is required"}`
    *   `404 Not Found`: `{"error": "Workspace not found for session: {session_id}"}`
    *   `500 Internal Server Error`: `{"error": "Error uploading file: {具体错误信息}"}`

### 2.2 根据设备 ID 获取会话列表

*   **端点**: `/api/sessions/{device_id}`
*   **方法**: `GET`
*   **描述**: 获取指定设备 ID 的所有会话列表，按创建时间降序排序。每个会话包含其基本信息以及该会话中的第一条用户消息（如果存在）。
*   **路径参数**:
    *   `device_id` (string): 客户端设备的唯一标识符。
*   **成功响应 (200 OK, JSON)**:
    ```json
    {
        "sessions": [
            {
                "id": "string (会话 UUID)",
                "workspace_dir": "string (会话工作区目录路径)",
                "created_at": "string (ISO 8601 格式的创建时间)",
                "device_id": "string (设备 ID)",
                "first_message": "string (该会话第一条用户消息的文本内容，如果不存在则为空字符串)"
            }
            // ... 可能有更多会话
        ]
    }
    ```
*   **错误响应**:
    *   `500 Internal Server Error`: `{"detail": "Error retrieving sessions: {具体错误信息}"}` (HTTPException)

### 2.3 获取会话事件

*   **端点**: `/api/sessions/{session_id}/events`
*   **方法**: `GET`
*   **描述**: 获取指定会话 ID 的所有事件，按时间戳升序排序。
*   **路径参数**:
    *   `session_id` (string): 会话的 UUID。
*   **成功响应 (200 OK, JSON)**:
    ```json
    {
        "events": [
            {
                "id": "integer (事件 ID)",
                "session_id": "string (会话 UUID)",
                "timestamp": "string (ISO 8601 格式的时间戳)",
                "event_type": "string (事件类型, 例如 'user_message', 'assistant_message')",
                "event_payload": "object (事件的负载内容，具体结构取决于 event_type)",
                "workspace_dir": "string (会话的工作区目录路径)"
            }
            // ... 可能有更多事件
        ]
    }
    ```
*   **错误响应**:
    *   `500 Internal Server Error`: `{"detail": "Error retrieving events: {具体错误信息}"}` (HTTPException)

## 3. 静态文件服务

*   **端点**: `/workspace/...`
*   **方法**: `GET`
*   **描述**:
    服务器会挂载一个静态文件目录到 `/workspace` 路径。此根目录通常是 `global_args.workspace` 指定的路径。
    当文件通过 `/api/upload` 上传时，它们被存放在 `{global_args.workspace}/{session_id}/{UPLOAD_FOLDER_NAME}/` 下。
    要访问特定会话中上传的文件，客户端需要构建类似 `/workspace/{session_id}/{UPLOAD_FOLDER_NAME}/{filename}` 的路径。
    例如，如果 `global_args.workspace` 是 `/srv/agent_workspaces`，一个文件 `report.pdf` 被上传到 `session123` 的 `uploads` 文件夹，那么可以通过 `/workspace/session123/uploads/report.pdf` 访问它。
    上传 API 返回的 `file.path` 字段 (例如 `"/uploads/report.pdf"`) 是相对于会话的 `uploads` 目录的路径，客户端需要在此基础上添加 `/workspace/{session_id}` 前缀。 