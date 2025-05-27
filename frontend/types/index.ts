// 基础消息类型
export interface Message {
  id: string;
  type: "user" | "assistant" | "action" | "stage" | "text";
  content: string;
  timestamp: Date | string;
  status?: string | { state: string; updated_at: string | null };
  details?: string;
  sender?: string;
}

// 操作类型
export interface Operation {
  id: string;
  type: "search" | "browse" | "file" | "edit" | "terminal";
  content: string;
  timestamp: Date;
  url?: string;
  fileName?: string;
  data?: any;
}

// 阶段类型
export interface Stage {
  id: string;
  title: string;
  timestamp: Date;
  status: "completed" | "running" | "pending";
  operations: Operation[];
}

// 任务元数据
export interface TaskMetadata {
  runningTime?: string;
  status: "running" | "completed" | "failed" | "pending";
  knowledgeSources?: number;
  dataSources?: number;
}

// 时间轴项目
export interface TimelineItem {
  id: string;
  element_type: "message" | "step";
  sender: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  sequence_number: number;
  related_step_id?: string | null;
  operations?: Operation[];
}

// 任务类型
export interface Task {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at?: string;
  messages: Message[];
  stages: Stage[];
  timeline: TimelineItem[];
  metadata: TaskMetadata;
}

// 任务API响应类型
export interface TaskResponse {
  id: string;
  title: string;
  metadata: TaskMetadataResponse;
  messages: MessageResponse[];
  stages: StageResponse[];
}

export interface TaskMetadataResponse {
  status: "pending" | "running" | "completed" | "failed";
  runningTime?: string;
  startedAt?: string;
  completedAt?: string;
  knowledgeSources?: number;
  dataSources?: number;
}

export interface MessageResponse {
  id: string;
  type: "user" | "assistant" | "action" | "stage";
  content: string;
  timestamp: string; // ISO 格式的日期字符串
  status?: string;
  details?: string;
}

export interface StageResponse {
  id: string;
  title: string;
  description?: string;
  timestamp: string; // ISO 格式的日期字符串
  status: "completed" | "running" | "pending";
  operations: OperationResponse[];
}

export interface OperationResponse {
  id: string;
  type: "search" | "browse" | "file" | "edit" | "terminal";
  content: string;
  timestamp: string; // ISO 格式的日期字符串
  url?: string;
  file_name?: string;
  result?: string;
  data?: any;
}

// 消息创建请求
export interface CreateMessageRequest {
  content: string;
  type: "user";
}

// 操作面板相关类型
export interface OperationStep {
  id: string;
  title: string;
  description: string;
  timestamp: Date;
  status?: string;
  sequence_number?: number;
  screenshot?: string;
  subSteps: OperationSubStep[];
  isExpanded?: boolean;
}

export interface OperationSubStep {
  id: string;
  title: string;
  type: "search" | "browse" | "edit" | "action" | "message" | "terminal";
  description?: string;
  timestamp: Date;
  content?: string;
  url?: string;
  fileName?: string;
  display_order?: number;
  data?: OperationDataResponse;
}

// 操作数据响应类型
export type OperationDataResponse = 
  | SearchOperationDataResponse 
  | BrowseOperationDataResponse 
  | EditOperationDataResponse 
  | ActionOperationDataResponse
  | MessageOperationDataResponse
  | TerminalOperationDataResponse;

export interface SearchOperationDataResponse {
  query: string;
  results: SearchResultItemResponse[];
}

export interface BrowseOperationDataResponse {
  url: string;
  title: string;
  screenshot?: string;
}

export interface EditOperationDataResponse {
  fileName: string;
  fileType: string;
  content: string;
  diff?: string;
}

export interface ActionOperationDataResponse {
  action: string;
  details?: string;
  results?: string;
}

export interface MessageOperationDataResponse {
  role: "user" | "assistant";
  content: string;
  status?: string;
}

export interface TerminalOperationDataResponse {
  command: string;
  output: string;
}

export interface SearchResultItemResponse {
  id: string;
  title: string;
  url: string;
  description: string;
}

// UI显示的任务类型
export interface UITask {
  id: string;
  title: string;
  time: string;
  status?: string;
  icon: string;
} 


interface Session {
  id: string
  workspace_dir: string
  created_at: string
  device_id: string
  first_message: string
}
