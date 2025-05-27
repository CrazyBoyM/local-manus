"use client"

import { toast } from "sonner";
import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { ChatArea } from "@/components/chat-area"
import { OperationPanel } from "@/components/operation-panel"
import { useMobile } from "@/hooks/use-mobile"
import { Task, UITask, OperationStep, OperationSubStep ,Stage,Operation,TimelineItem,Message} from "@/types"
import{SearchOperationDataResponse 
  ,BrowseOperationDataResponse 
  ,EditOperationDataResponse 
  ,ActionOperationDataResponse
  ,MessageOperationDataResponse
  ,TerminalOperationDataResponse,
  SearchResultItemResponse} from "@/types"
import Cookies from "js-cookie";
import { v4 as uuidv4 } from "uuid";
import { useRouter, useSearchParams } from "next/navigation";
import { cloneDeep, debounce } from "lodash";
import {
  ActionStep,   // 代理执行的动作步骤类型
  AgentEvent,   // WebSocket 事件类型枚举
  IEvent,       // 通用事件接口 (用于历史记录)
  Messages,      // 聊天消息类型
  TAB,          // 面板标签页枚举 (浏览器, 代码, 终端)
  TOOL,         // 工具类型枚举
} from "@/types/agent";
export default function Home() {
  const [currentActionData, setCurrentActionData] = useState<ActionStep>();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const [taskList, setTaskList] = useState<UITask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [taskDetails, setTaskDetails] = useState<any | null>(null)
  const [operationSteps, setOperationSteps] = useState<OperationStep[]>([])
  const isMobile = useMobile()
  const [deviceId, setDeviceId] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [workspaceInfo, setWorkspaceInfo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Messages[]>([]);
  const [isCompleted, setIsCompleted] = useState(false);
  const [browserUrl, setBrowserUrl] = useState("");
  const searchParams = useSearchParams();
  const [filesContent, setFilesContent] = useState<{ [key: string]: string }>(
    {}
  );
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const [sessions, setSessions] = useState<UITask[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null); // 当前活动的会话 ID 状态
  const [currentQuestion, setCurrentQuestion] = useState(""); // 问题输入框中的当前文本
  const [socket, setSocket] = useState<WebSocket | null>(null); // WebSocket 连接实例
  const isReplayMode = useMemo(() => !!searchParams.get("id"), [searchParams]);
  const [isUseDeepResearch, setIsUseDeepResearch] = useState(true);

  const [taskId,setTaskId] = useState<string>("")



  // WebSocket 事件处理器 (核心逻辑)
  const handleEvent = (data: {
    id: string; // 事件 ID (由前端生成或后端提供)
    type: AgentEvent; // 事件类型
    content: Record<string, unknown>; // 事件内容 (任意对象)
  }) => {
    switch (data.type) {
      case AgentEvent.USER_MESSAGE: // 用户消息 (这个事件似乎不由 WebSocket 触发，而是由 handleQuestionSubmit 直接添加)
        console.log("User message:", data);
        setMessages((prev) => [
          ...prev,
          {
            id: data.id,
            role: "user",
            content: data.content.text as string,
            timestamp: Date.now(),
          },
        ]);
        break;
      case AgentEvent.PROCESSING: // 代理正在处理
        setIsLoading(true);
        break;
      case AgentEvent.WORKSPACE_INFO: // 工作区信息
        setWorkspaceInfo(data.content.path as string);
        break;
      case AgentEvent.AGENT_THINKING: // 代理正在思考 (通常是文本提示)
        setMessages((prev) => [
          ...prev,
          {
            id: data.id,
            role: "assistant",
            content: data.content.text as string, // "Thinking..."
            timestamp: Date.now(),
          },
        ]);
        break;
      case AgentEvent.TOOL_CALL: // 工具调用
        // 如果是“顺序思考”工具，直接作为助手消息显示思考内容
        if (data.content.tool_name === TOOL.SEQUENTIAL_THINKING) {
          setMessages((prev) => [
            ...prev,
            {
              id: data.id,
              role: "assistant",
              content: (data.content.tool_input as { thought: string }).thought as string,
              timestamp: Date.now(),
            },
          ]);
        } else { // 其他工具调用
          const message: Message = {
            id: data.id,
            role: "assistant",
            // 将工具调用信息包装在 action 字段中
            action: { type: data.content.tool_name as TOOL, data: data.content },
            timestamp: Date.now(),
          };
          // 如果工具输入包含 URL，则设置浏览器 URL
          const url = (data.content.tool_input as { url: string })?.url as string;
          if (url) setBrowserUrl(url);
          setMessages((prev) => [...prev, message]); // 添加到消息列表
          handleClickAction(message.action); // 触发 handleClickAction 更新 UI
        }
        break;
      case AgentEvent.FILE_EDIT: // 文件编辑事件 (通常是代码编辑器内容变化)
        setMessages((prev) => {
          const lastMessage = cloneDeep(prev[prev.length - 1]); // 深拷贝最后一条消息
          // 假设最后一条消息是 STR_REPLACE_EDITOR 工具调用
          if (lastMessage.action && lastMessage.action.type === TOOL.STR_REPLACE_EDITOR) {
            lastMessage.action.data.content = data.content.content as string; // 更新内容
            lastMessage.action.data.path = data.content.path as string; // 更新路径
            // 更新 filesContent 状态中对应文件的内容
            const filePath = (data.content.path as string)?.includes(workspaceInfo)
              ? (data.content.path as string)
              : `${workspaceInfo}/${data.content.path}`;
            setFilesContent((prevContent) => ({ ...prevContent, [filePath]: data.content.content as string }));
          }
          // 延迟更新 UI，确保数据已设置
          setTimeout(() => handleClickAction(lastMessage.action), 500);
          return [...prev.slice(0, -1), lastMessage]; // 替换最后一条消息
        });
        break;
      case AgentEvent.TOOL_RESULT: // 工具执行结果
        // 如果是 BROWSER_USE 工具，结果直接作为助手消息显示
        if (data.content.tool_name === TOOL.BROWSER_USE) {
          setMessages((prev) => [
            ...prev,
            {
              id: data.id,
              role: "assistant",
              content: data.content.result as string, // 工具结果文本
              timestamp: Date.now(),
            },
          ]);
        } else {
          if (data.content.tool_name !== TOOL.SEQUENTIAL_THINKING && data.content.tool_name !== TOOL.PRESENTATION) {
            setMessages((prev) => {
              const lastMessage = cloneDeep(prev[prev.length - 1]); // 深拷贝最后一条消息
              // 检查最后一条消息是否是对应的工具调用
              if (lastMessage?.action && lastMessage.action?.type === data.content.tool_name) {
                lastMessage.action.data.result = `${data.content.result}`; // 设置结果
                // 特殊处理浏览器相关工具的结果 (通常是截图数据)
                if (
                  [
                    TOOL.BROWSER_VIEW, TOOL.BROWSER_CLICK, TOOL.BROWSER_ENTER_TEXT,
                    TOOL.BROWSER_PRESS_KEY, TOOL.BROWSER_GET_SELECT_OPTIONS,
                    TOOL.BROWSER_SELECT_DROPDOWN_OPTION, TOOL.BROWSER_SWITCH_TAB,
                    TOOL.BROWSER_OPEN_NEW_TAB, TOOL.BROWSER_WAIT, TOOL.BROWSER_SCROLL_DOWN,
                    TOOL.BROWSER_SCROLL_UP, TOOL.BROWSER_NAVIGATION, TOOL.BROWSER_RESTART,
                  ].includes(data.content.tool_name as TOOL)
                ) {
                  // 从结果数组中提取图片数据
                  lastMessage.action.data.result =
                    data.content.result && Array.isArray(data.content.result)
                      ? data.content.result.find((item) => item.type === "image")?.source?.data
                      : undefined;
                }
                lastMessage.action.data.isResult = true; // 标记为结果数据
                // 延迟更新 UI
                setTimeout(() => handleClickAction(lastMessage.action), 500);
                return [...prev.slice(0, -1), lastMessage]; // 替换最后一条消息
              } else { // 如果最后一条消息不是对应的工具调用，则将结果作为新的动作消息添加
                return [...prev, { ...lastMessage, action: data.content as ActionStep }];
              }
            });
          }
        }
        break;
      case AgentEvent.AGENT_RESPONSE: // 代理的最终文本响应
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(), // 使用新的时间戳作为ID，确保是新消息
            role: "assistant",
            content: data.content.text as string, // 响应文本
            timestamp: Date.now(),
          },
        ]);
        setIsCompleted(true); // 标记会话/查询完成
        setIsLoading(false); // 结束加载状态
        break;
      case AgentEvent.UPLOAD_SUCCESS: // 文件上传成功
        setIsUploading(false); // 结束上传状态
        const newFiles = data.content.files as { path: string; saved_path: string }[];
        const paths = newFiles.map((f) => f.path); // 获取上传成功的文件路径
        setUploadedFiles((prev) => [...prev, ...paths]); // 添加到已上传文件列表
        break;
      case "error": // WebSocket 错误事件 (自定义的，非标准 WebSocket error event)
        toast.error(data.content.message as string); // 显示错误提示
        setIsUploading(false); // 重置上传和加载状态
        setIsLoading(false);
        break;
    }
  };

  // useEffect: 当 URL 查询参数变化时，获取 'id' 参数并设置为 sessionId
  useEffect(() => {
    const id = searchParams.get("id");
    setSessionId(id);
  }, [searchParams]);

  const handleClickAction = debounce(
    (data: ActionStep | undefined, showTabOnly = false) => {
      if (!data) return; // 如果没有数据，则返回

      // 根据动作类型切换活动标签页，并设置当前动作数据
      switch (data.type) {
        case TOOL.WEB_SEARCH: // 网页搜索

          setCurrentActionData(data);
          break;

        case TOOL.IMAGE_GENERATE: // 图像生成
        case TOOL.BROWSER_USE:    // 浏览器使用 (通常是摘要)
        case TOOL.VISIT:          // 访问网页 (原始HTML)

          setCurrentActionData(data);
          break;
        // 以下都是浏览器自动化相关的工具
        case TOOL.BROWSER_CLICK:
        case TOOL.BROWSER_ENTER_TEXT:
        case TOOL.BROWSER_PRESS_KEY:
        case TOOL.BROWSER_GET_SELECT_OPTIONS:
        case TOOL.BROWSER_SELECT_DROPDOWN_OPTION:
        case TOOL.BROWSER_SWITCH_TAB:
        case TOOL.BROWSER_OPEN_NEW_TAB:
        case TOOL.BROWSER_VIEW:
        case TOOL.BROWSER_NAVIGATION:
        case TOOL.BROWSER_RESTART:
        case TOOL.BROWSER_WAIT:
        case TOOL.BROWSER_SCROLL_DOWN:
        case TOOL.BROWSER_SCROLL_UP:
          setCurrentActionData(data);
          break;

        case TOOL.BASH: // Bash 命令执行
          setCurrentActionData(data);
          break;

        case TOOL.STR_REPLACE_EDITOR: // 字符串替换编辑器 (代码编辑)

          setCurrentActionData(data); // 设置当前动作数据
          // 获取文件路径

          break;

        default: // 其他未处理的工具类型
          break;
      }
    },
    50 // 防抖延迟 50ms
  );

  // useEffect: 当 sessionId (来自 URL) 可用时，获取会话事件历史记录
  useEffect(() => {
    const fetchSessionEvents = async () => {
      const id = searchParams.get("id"); // 再次获取 id，确保是最新的
      if (!id) return; // 如果没有 id，则不执行获取

      setIsLoadingSession(true); // 开始加载会话
      try {
        // 发起 API 请求获取指定 session ID 的事件历史
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/sessions/${id}/events`
        );

        if (!response.ok) { // 如果请求失败
          throw new Error(
            `Error fetching session events: ${response.statusText}`
          );
        }

        const data = await response.json(); // 解析 JSON 响应数据
        // 设置工作区路径，取第一个事件中的 workspace_dir (如果存在)
        setWorkspaceInfo(data.events?.[0]?.workspace_dir);

        if (data.events && Array.isArray(data.events)) { // 如果事件数据存在且是数组
          const reconstructedMessages: Message[] = []; // 用于存储重构后的消息

          // 定义一个带延迟处理事件的异步函数
          const processEventsWithDelay = async () => {
            setIsLoading(true); // 开始加载状态 (模拟实时接收)
            for (let i = 0; i < data.events.length; i++) {
              const event = data.events[i];
              // 每个事件处理之间增加 1.5 秒的延迟
              await new Promise((resolve) => setTimeout(resolve, 1500));
              // 调用 handleEvent 处理每个事件的载荷
              handleEvent({ ...event.event_payload, id: event.id });
            }
            // 注意：这里的 setIsLoading(true) 之后没有对应的 setIsLoading(false)
            // 这可能是一个 bug 或者后续的 AGENT_RESPONSE 事件会处理它
          };

          processEventsWithDelay(); // 开始带延迟地处理事件

          // 如果重构消息后有内容，则设置消息状态并标记为完成
          // 注意：reconstructedMessages 在这里是空的，因为上面的 processEventsWithDelay 是异步的
          // 并且 handleEvent 是直接更新 messages 状态，而不是填充 reconstructedMessages。
          // 这部分逻辑可能需要调整才能按预期工作。
          if (reconstructedMessages.length > 0) {
            setMessages(reconstructedMessages);
            setIsCompleted(true);
          }

          // 从事件中提取工作区信息 (如果存在 WORKSPACE_INFO 事件)
          const workspaceEvent = data.events.find(
            (e: IEvent) => e.event_type === AgentEvent.WORKSPACE_INFO
          );
          if (workspaceEvent && workspaceEvent.event_payload.path) {
            setWorkspaceInfo(workspaceEvent.event_payload.path as string);
          }
        }
      } catch (error) { // 捕获请求或处理过程中的错误
        console.error("Failed to fetch session events:", error);
        toast.error("Failed to load session history"); // 显示错误提示
      } finally {
        setIsLoadingSession(false); // 结束加载会话状态
      }
    };

    fetchSessionEvents(); // 调用获取会话事件的函数
  }, [searchParams]); // 依赖于 searchParams 的变化


  // useEffect: 页面加载时初始化设备 ID
  useEffect(() => {
    let existingDeviceId = Cookies.get("device_id"); // 从 Cookie 中获取已存在的 device_id

    if (!existingDeviceId) { // 如果 Cookie 中不存在
      existingDeviceId = uuidv4(); // 生成一个新的 UUID 作为 device_id
      // 将新的 device_id 保存到 Cookie 中，有效期一年
      Cookies.set("device_id", existingDeviceId, {
        expires: 365, // 365 天
        sameSite: "strict", // SameSite策略，增强安全性
        secure: window.location.protocol === "https:", // 仅在 HTTPS 下发送 Cookie
      });
      console.log("Generated new device ID:", existingDeviceId);
    } else {
      console.log("Using existing device ID:", existingDeviceId);
    }
    setDeviceId(existingDeviceId); // 将 device_id 设置到组件状态中
  }, []); // 空依赖数组，仅在组件首次加载时运行

  // 获取任务列表
  useEffect(() => {
    const fetchData = async () => {
      // 如果没有 deviceId，则不执行获取
      if (!deviceId) return;

      try {
        setLoading(true)
        setError(null) // 清空之前的错误信息

        // 从API获取会话列表
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/sessions/${deviceId}`
        )
        if (!response.ok) {
          throw new Error(`Error fetching sessions: ${response.statusText}`)
        }

        const data = await response.json()
        const apiSessions = data.sessions || []

        // 转换为UI需要的格式（这里假设sessions需要类似tasks的处理）
        const uiSessions = apiSessions.map((session) => {
          // 设置图标
          let icon
          if (session.first_message?.includes("小说")) {
            icon = "book-open"
          } else if (session.title?.includes("网站") || session.title?.includes("APP")) {
            icon = "globe"
          } else {
            icon = "book"
          }

          // 格式化时间
          const sessionDate = new Date(session.created_at)
          const now = new Date()
          const diffMs = now.getTime() - sessionDate.getTime()
          const diffMins = Math.floor(diffMs / 60000)
          const diffHours = Math.floor(diffMins / 60)
          const diffDays = Math.floor(diffHours / 24)
          const diffMonths = Math.floor(diffDays / 30)

          let timeDisplay = ""
          if (diffMonths > 0) {
            timeDisplay = `${diffMonths} 个月前`
          } else if (diffDays > 0) {
            timeDisplay = `${diffDays} 天前`
          } else if (diffHours > 0) {
            timeDisplay = `${diffHours} 小时前`
          } else if (diffMins > 0) {
            timeDisplay = `${diffMins} 分钟前`
          } else {
            timeDisplay = "刚刚"
          }



          return {
            ...session,
            id: session.id,
            title: session.first_message,
            time: timeDisplay,
            status: "完成",
            icon: icon
          }
        })

        setSessions(uiSessions) // 使用 setSessions 而不是 setTaskList


      } catch (err) {
        const error = err as Error
        console.error("Failed to fetch sessions:", error)
        setError(`Failed to load sessions: ${error.message || "Please try again."}`)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [deviceId]) // 依赖项包含 deviceId


  const handleSessionClick = (sessionId: string) => {
    window.location.href = `/?id=${sessionId}`; // 通过修改 URL 跳转到指定会话的页面


  };
  // 当 URL 查询参数变化时，获取 'id' 参数并设置为 sessionId
  useEffect(() => {
    const id = searchParams.get("id"); // 从 URL 中获取 'id' 参数
    if (id) {
      setActiveSessionId(id); // 如果存在 'id'，则设置为当前活动会话 ID
    } else {
      setActiveSessionId(null); // 否则，清空活动会话 ID
    }
  }, [searchParams]); // 依赖于 searchParams 的变化


   // useEffect: 当 deviceId 和非回放模式时，建立 WebSocket 连接
   useEffect(() => {
    const connectWebSocket = () => {
      const params = new URLSearchParams({ device_id: deviceId }); // 将 device_id 作为查询参数
      const ws = new WebSocket(`${process.env.NEXT_PUBLIC_API_URL}/ws?${params.toString()}`);
      ws.onopen = () => { // 连接打开时
        console.log("WebSocket connection established");
        // 发送 'workspace_info' 事件请求工作区信息 (如果需要)
        ws.send(JSON.stringify({ type: "workspace_info", content: {} }));
      };
      ws.onmessage = (event) => { // 收到消息时
        try {
          const data = JSON.parse(event.data as string); // 解析 JSON 数据
          // 调用 handleEvent 处理消息，并为事件生成一个前端ID
          handleEvent({ ...data, id: Date.now().toString() });
        } catch (error) {
          console.error("Error parsing WebSocket data:", error);
        }
      };
      ws.onerror = (error) => { // 发生错误时
        console.log("WebSocket error:", error);
        toast.error("WebSocket connection error");
      };
      ws.onclose = () => { // 连接关闭时
        console.log("WebSocket connection closed");
        setSocket(null); // 清空 socket 实例
      };
      setSocket(ws); // 保存 socket 实例到状态
    };

    if (deviceId && !isReplayMode) { // 如果有 deviceId 且不是回放模式
      connectWebSocket(); // 建立连接
    }
    return () => { // 组件卸载时的清理函数
      if (socket) socket.close(); // 关闭 WebSocket 连接
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, isReplayMode]); // 依赖于 deviceId 和 isReplayMode




  // 处理用户提交问题的函数
  const handleQuestionSubmit = async (newQuestion: string) => {
    const newTaskId = uuidv4();
  setTaskId(newTaskId);
    if (!newQuestion.trim() || isLoading) return; // 如果问题为空或正在加载，则不处理

    setIsLoading(true); // 开始加载状态
    setCurrentQuestion(""); // 清空问题输入框 (这个状态似乎没有被 QuestionInput 组件使用value绑定)
    setIsCompleted(false); // 重置完成状态

    // 如果 sessionId 不存在 (通常是新会话)，尝试从 workspaceInfo 中提取
    if (!sessionId) {
      const id = `${workspaceInfo}`.split("/").pop(); // 从工作区路径末尾取ID
      if (id) {
        setSessionId(id);
      }
    }

    // 创建用户消息对象
    const newUserMessage: Messages = {
      id: Date.now().toString(), // 使用时间戳作为ID
      role: "user",
      content: newQuestion,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, newUserMessage]); // 将用户消息添加到消息列表

    // 检查 WebSocket 连接是否正常
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      toast.error("WebSocket connection is not open. Please try again.");
      setIsLoading(false);
      return;
    }

    // 如果是新会话的第一次查询，发送 'init_agent' 事件
    if (!sessionId) {
      socket.send(
        JSON.stringify({
          type: "init_agent", // 事件类型
          content: { // 事件内容
            tool_args: { // 工具参数配置
              deep_research: isUseDeepResearch, // 是否使用深度研究
              pdf: true,              // 是否启用 PDF 工具
              media_generation: true, // 是否启用媒体生成工具
              audio_generation: true, // 是否启用音频生成工具
              browser: true,          // 是否启用浏览器工具
            },
          },
        })
      );
    }

    // 发送用户查询 ('query' 事件)
    socket.send(
      JSON.stringify({
        type: "query", // 事件类型
        content: { // 事件内容
          text: newQuestion, // 查询文本
          resume: messages.length > 0, // 是否是继续对话 (基于已有消息数量)
          // 已上传文件列表 (路径前加 '.')
          files: uploadedFiles?.map((file) => `.${file}`),
        },
      })
    );

    console.log("发送请求")
  };


  const handleChatAreaMessage = (content: string) => {
    console.log("ChatArea 发送消息:", content);
    
    // 如果是新对话且没有 taskId，可能需要先创建任务
    if (!selectedTask) {
      // 这里可能需要先创建一个新任务
      // 或者使用不同的逻辑处理新对话
      console.log("没有选中的任务，可能是新对话");
    }
    
    // 调用原有的 handleQuestionSubmit
    handleQuestionSubmit(content);
  };






  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  const createTaskFromMessages = (messages: Messages[]): Task => {
    const timestamp = new Date().toISOString();
    const taskId = sessionId || `task_${Date.now()}`;
    setSelectedTask(taskId);
    
    const taskMessages: Message[] = [];
    const allStages: Stage[] = [];
    const allOperations: Operation[] = [];
    const timeline: TimelineItem[] = [];
    //const operationSteps: OperationStep[] = []; // 新增：操作步骤数组
    
    // 用于跟踪当前步骤
    let currentStep: OperationStep | null = null;
    let stepCounter = 0;
    
    messages.forEach((msg, index) => {
      // 1. 先添加用户/助手的文本消息
      if (msg.content) {
        const textMessage: Message = {
          id: `${msg.id}_text`,
          type: msg.role === "user" ? "user" : "assistant",
          content: msg.content,
          timestamp: new Date(msg.timestamp).toISOString(),
          status: "completed",
          sender: msg.role
        };
        taskMessages.push(textMessage);
        
        // **创建消息类型的子步骤**
        const messageSubStep: OperationSubStep = {
          id: `substep_${msg.id}_message`,
          title: msg.role === "user" ? "User Input" : "Assistant Response",
          type: "message",
          description: msg.content.slice(0, 100) + (msg.content.length > 100 ? "..." : ""),
          timestamp: new Date(msg.timestamp),
          content: msg.content,
          display_order: index,
          data: {
            role: msg.role,
            content: msg.content,
            status: "completed"
          } as MessageOperationDataResponse
        };
        
        // 如果是用户消息，创建新的操作步骤
        if (msg.role === "user") {
          stepCounter++;
          currentStep = {
            id: `step_${stepCounter}`,
            title: `Step ${stepCounter}: ${msg.content.slice(0, 50)}...`,
            description: msg.content,
            timestamp: new Date(msg.timestamp),
            status: "running",
            sequence_number: stepCounter,
            subSteps: [messageSubStep],
            isExpanded: false
          };
          operationSteps.push(currentStep);
        } else if (currentStep) {
          // 如果是助手消息，添加到当前步骤
          currentStep.subSteps.push(messageSubStep);
        }
      }
      
      // 2. 如果有 action，添加 action 消息和 stage 消息
      if (msg.action) {
        const operationType = getOperationType(msg.action.type);
        const toolInput = msg.action.data.tool_input || {};
        
        // 创建 Operation
        const operation: Operation = {
          id: `op_${msg.id}`,
          type: operationType,
          content: toolInput.description || 
                   toolInput.text || 
                   msg.action.data.content || 
                   msg.action.data.query || "",
          timestamp: new Date(msg.timestamp),
          url: toolInput.url,
          fileName: toolInput.file_path || toolInput.output_filename,
          data: msg.action.data
        };
        allOperations.push(operation);
        
        // 创建 Stage
        const stage: Stage = {
          id: `stage_${msg.id}`,
          title: msg.action.data.tool_name || getToolDisplayName(msg.action.type),
          timestamp: new Date(msg.timestamp),
          status: msg.action.data.isResult ? "completed" : "running",
          operations: [operation]
        };
        allStages.push(stage);
        
        // 添加 action 消息（显示工具调用）
        const actionMessage: Message = {
          id: `${msg.id}_action`,
          type: "action",
          content: formatActionContent(msg.action),
          timestamp: new Date(msg.timestamp).toISOString(),
          status: msg.action.data.isResult ? "completed" : "running",
          details: JSON.stringify(toolInput, null, 2),
          sender: "assistant"
        };
        taskMessages.push(actionMessage);
        
        // 添加 stage 消息（显示执行阶段）
        const stageMessage: Message = {
          id: `${msg.id}_stage`,
          type: "stage",
          content: `${stage.title}: ${operation.content}`,
          timestamp: new Date(msg.timestamp).toISOString(),
          status: stage.status,
          sender: "system"
        };
        taskMessages.push(stageMessage);
        
        // **创建操作子步骤**
        const subStep = createOperationSubStep(msg.action, msg.id, msg.timestamp, index);
        
        // 如果当前没有步骤，创建一个新步骤
        if (!currentStep) {
          stepCounter++;
          currentStep = {
            id: `step_${stepCounter}`,
            title: `Step ${stepCounter}: ${getToolDisplayName(msg.action.type)}`,
            description: formatActionContent(msg.action),
            timestamp: new Date(msg.timestamp),
            status: msg.action.data.isResult ? "completed" : "running",
            sequence_number: stepCounter,
            subSteps: [subStep],
            isExpanded: false
          };
          operationSteps.push(currentStep);
        } else {
          // 添加到当前步骤
          currentStep.subSteps.push(subStep);
          // 更新步骤状态
          if (msg.action.data.isResult) {
            currentStep.status = "completed";
          }
        }
        
        // 如果有结果，添加结果消息
        if (msg.action.data.result) {
          const resultMessage: Message = {
            id: `${msg.id}_result`,
            type: "assistant",
            content: formatResult(msg.action.data.result),
            timestamp: new Date(msg.timestamp + 1).toISOString(),
            status: "completed",
            sender: "assistant"
          };
          taskMessages.push(resultMessage);
        }
      }
      
      // 3. 添加到 timeline
      timeline.push({
        id: `timeline_${msg.id}`,
        element_type: msg.action ? "step" : "message",
        sender: msg.role === "user" ? "user" : "assistant",
        content: msg.content || formatActionContent(msg.action),
        timestamp: new Date(msg.timestamp).toISOString(),
        sequence_number: index + 1,
        related_step_id: msg.action ? `stage_${msg.id}` : null,
        operations: msg.action ? [allOperations[allOperations.length - 1]] : []
      });
    });
    
    const task: Task = {
      id: taskId,
      title: messages[0]?.content?.slice(0, 50) || "Untitled Task",
      status: isCompleted ? "completed" : "running",
      created_at: timestamp,
      updated_at: timestamp,
      messages: taskMessages,
      stages: allStages,
      timeline: timeline,
      operationSteps: operationSteps, // 新增：操作步骤
      metadata: {
        status: isCompleted ? "completed" : "running",
        runningTime: "0s",
        knowledgeSources: uploadedFiles.length,
        dataSources: allStages.length
      }
    };
    
    return task;
  };
  
  // **新增辅助函数：创建操作子步骤**
  function createOperationSubStep(
    action: ActionStep, 
    msgId: string, 
    timestamp: number,
    displayOrder: number
  ): OperationSubStep {
    const toolInput = action.data.tool_input || {};
    const type = getOperationSubStepType(action.type);
    
    const baseSubStep: OperationSubStep = {
      id: `substep_${msgId}`,
      title: getToolDisplayName(action.type),
      type: type,
      description: toolInput.description || toolInput.text || "",
      timestamp: new Date(timestamp),
      display_order: displayOrder
    };
    
    // 根据不同类型添加特定数据
    switch (type) {
      case "search":
        baseSubStep.data = {
          query: toolInput.query || toolInput.text || "",
          results: parseSearchResults(action.data.result)
        } as SearchOperationDataResponse;
        break;
        
      case "browse":
        baseSubStep.url = toolInput.url;
        baseSubStep.data = {
          url: toolInput.url || "",
          title: toolInput.text || "Browsing page",
          screenshot: action.data.result?.screenshot
        } as BrowseOperationDataResponse;
        break;
        
      case "edit":
        baseSubStep.fileName = toolInput.file_path || toolInput.file || "";
        baseSubStep.data = {
          fileName: toolInput.file_path || toolInput.file || "",
          fileType: getFileType(toolInput.file_path || ""),
          content: toolInput.file_text || toolInput.text || "",
          diff: action.data.result?.diff
        } as EditOperationDataResponse;
        break;
        
      case "terminal":
        baseSubStep.data = {
          command: toolInput.command || "",
          output: formatResult(action.data.result)
        } as TerminalOperationDataResponse;
        break;
        
      case "action":
      default:
        baseSubStep.data = {
          action: action.data.tool_name || action.type,
          details: JSON.stringify(toolInput, null, 2),
          results: formatResult(action.data.result)
        } as ActionOperationDataResponse;
        break;
    }
    
    return baseSubStep;
  }
  
  // **新增辅助函数：获取操作子步骤类型**
  function getOperationSubStepType(toolType: TOOL): OperationSubStep["type"] {
    switch (toolType) {
      case TOOL.WEB_SEARCH:
      case TOOL.IMAGE_SEARCH:
      case TOOL.DEEP_RESEARCH:
        return "search";
        
      case TOOL.BROWSER_USE:
      case TOOL.VISIT:
      case TOOL.BROWSER_VIEW:
      case TOOL.BROWSER_NAVIGATION:
      case TOOL.BROWSER_CLICK:
      case TOOL.BROWSER_ENTER_TEXT:
      case TOOL.BROWSER_SCROLL_DOWN:
      case TOOL.BROWSER_SCROLL_UP:
      case TOOL.BROWSER_OPEN_NEW_TAB:
      case TOOL.BROWSER_SWITCH_TAB:
        return "browse";
        
      case TOOL.STR_REPLACE_EDITOR:
      case TOOL.PDF_TEXT_EXTRACT:
        return "edit";
        
      case TOOL.BASH:
        return "terminal";
        
      default:
        return "action";
    }
  }
  
  // **新增辅助函数：解析搜索结果**
  function parseSearchResults(result: any): SearchResultItemResponse[] {
    if (!result) return [];
    
    // 如果结果是字符串，尝试解析
    if (typeof result === "string") {
      try {
        const parsed = JSON.parse(result);
        if (Array.isArray(parsed)) {
          return parsed.map((item, index) => ({
            id: `result_${index}`,
            title: item.title || "Untitled",
            url: item.url || "",
            description: item.description || item.snippet || ""
          }));
        }
      } catch (e) {
        // 如果解析失败，返回单个结果
        return [{
          id: "result_0",
          title: "Search Result",
          url: "",
          description: result
        }];
      }
    }
    
    // 如果结果是数组
    if (Array.isArray(result)) {
      return result.map((item, index) => ({
        id: `result_${index}`,
        title: item.title || `Result ${index + 1}`,
        url: item.url || "",
        description: item.description || item.snippet || ""
      }));
    }
    
    // 如果结果是对象
    if (typeof result === "object" && result.results) {
      return parseSearchResults(result.results);
    }
    
    return [];
  }
  
  // **新增辅助函数：获取文件类型**
  function getFileType(filePath: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase() || "";
    const fileTypes: Record<string, string> = {
      "js": "javascript",
      "ts": "typescript",
      "jsx": "javascript",
      "tsx": "typescript",
      "py": "python",
      "java": "java",
      "cpp": "cpp",
      "c": "c",
      "cs": "csharp",
      "go": "go",
      "rs": "rust",
      "php": "php",
      "rb": "ruby",
      "swift": "swift",
      "kt": "kotlin",
      "md": "markdown",
      "json": "json",
      "xml": "xml",
      "yaml": "yaml",
      "yml": "yaml",
      "txt": "text",
      "pdf": "pdf",
      "doc": "document",
      "docx": "document"
    };
    
    return fileTypes[extension] || "text";
  }
  
  
  // 辅助函数：获取工具的显示名称
  function getToolDisplayName(toolType: TOOL): string {
    const toolNames: Record<TOOL, string> = {
      [TOOL.WEB_SEARCH]: "Web Search",
      [TOOL.IMAGE_SEARCH]: "Image Search",
      [TOOL.DEEP_RESEARCH]: "Deep Research",
      [TOOL.BROWSER_USE]: "Browser",
      [TOOL.VISIT]: "Visit Page",
      [TOOL.STR_REPLACE_EDITOR]: "Text Editor",
      [TOOL.PDF_TEXT_EXTRACT]: "PDF Extraction",
      [TOOL.BASH]: "Terminal",
      // ... 添加其他工具名称
    };
    return toolNames[toolType] || toolType;
  }
  
  // 辅助函数：格式化 action 内容
  function formatActionContent(action?: ActionStep): string {
    if (!action) return "";
    
    const toolName = action.data.tool_name || getToolDisplayName(action.type);
    const input = action.data.tool_input || {};
    
    switch (action.type) {
      case TOOL.WEB_SEARCH:
      case TOOL.IMAGE_SEARCH:
        return `🔍 Searching: ${input.query || input.description || ""}`;
      
      case TOOL.BROWSER_USE:
      case TOOL.VISIT:
        return `🌐 Browsing: ${input.url || ""}`;
      
      case TOOL.STR_REPLACE_EDITOR:
        return `✏️ Editing: ${input.file_path || input.file || ""}`;
      
      case TOOL.BASH:
        return `💻 Running command: ${input.command || ""}`;
      
      default:
        return `🔧 ${toolName}: ${input.description || input.text || ""}`;
    }
  }
  
  // 辅助函数：格式化结果
  function formatResult(result: any): string {
    if (typeof result === "string") {
      return result;
    }
    if (typeof result === "object") {
      return JSON.stringify(result, null, 2);
    }
    return String(result);
  }
  
// 根据 TOOL 类型映射到 Operation 类型
function getOperationType(toolType: TOOL): Operation["type"] {
  switch (toolType) {
    case TOOL.WEB_SEARCH:
    case TOOL.IMAGE_SEARCH:
    case TOOL.DEEP_RESEARCH:
      return "search";
      
    case TOOL.BROWSER_USE:
    case TOOL.VISIT:
    case TOOL.BROWSER_VIEW:
    case TOOL.BROWSER_NAVIGATION:
    case TOOL.BROWSER_CLICK:
    case TOOL.BROWSER_ENTER_TEXT:
    case TOOL.BROWSER_SCROLL_DOWN:
    case TOOL.BROWSER_SCROLL_UP:
    case TOOL.BROWSER_OPEN_NEW_TAB:
    case TOOL.BROWSER_SWITCH_TAB:
      return "browse";
      
    case TOOL.STR_REPLACE_EDITOR:
    case TOOL.PDF_TEXT_EXTRACT:
      return "edit";
      
    case TOOL.BASH:
      return "terminal";
      
    // 默认归类为 file
    default:
      return "file";
  }
}
const taskData = useMemo(() => {
  if (!messages || messages.length === 0) return null;
  return createTaskFromMessages(messages);
}, [messages, sessionId, isCompleted, uploadedFiles]); // 添加所有相关依赖


console.log("op:",operationSteps)

  return (
    <main className="flex h-full w-full overflow-hidden bg-manus-background">
      {/* 侧边栏 */}
      <div
        className={`transition-all duration-300 ease-in-out h-screen relative ${isMobile ? "absolute z-50 bg-manus-background" : ""
          } ${sidebarOpen ? "w-64" : "w-12"}`}
      >
        <Sidebar
          tasks={sessions}
          loading={loading}
          error={error}
          onSelectTask={handleSessionClick}
          selectedTask={selectedTask}
          isOpen={sidebarOpen}
          onToggle={toggleSidebar}
          onCreateTask={handleQuestionSubmit}
        />
      </div>

      {/* 主内容区域 */}
      <div className="flex flex-1 flex-col md:flex-row overflow-hidden h-screen">
        {/* 聊天区域与操作步骤集成 */}
        <div className="w-full md:w-3/5 h-screen flex-1 border-r border-manus-border overflow-hidden">
          <ChatArea
            taskId={taskId}
            taskData={taskData}
            loading={loading}
            error={error}
            onSendMessage={handleChatAreaMessage}
          />
        </div>

        {/* 内容显示和导航面板 */}
        <div className="w-full md:w-2/5 h-screen flex-1 overflow-hidden">
          <OperationPanel
            taskId={selectedTask}
            operationSteps={operationSteps}
            loading={loading}
          />
        </div>
      </div>
    </main>
  )
}
