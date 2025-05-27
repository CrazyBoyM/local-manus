# ii_agent/llm/openai.py 文件中的相关导入
import json
import os
import random
import time
from typing import Any, Tuple, cast, List, Dict # 确保导入了 List 和 Dict
import openai

from openai import (
    APIConnectionError as OpenAI_APIConnectionError,
)
from openai import (
    InternalServerError as OpenAI_InternalServerError,
)
from openai import (
    RateLimitError as OpenAI_RateLimitError,
)
from openai._types import (
    NOT_GIVEN as OpenAI_NOT_GIVEN,
)

from ii_agent.llm.base import (
    LLMClient,
    AssistantContentBlock,
    LLMMessages,
    ToolParam,
    TextPrompt,
    ToolCall,
    TextResult,
    ToolFormattedResult,
    ImageBlock,
)


class OpenAIDirectClient(LLMClient):
    """通过第一方 API 使用 OpenAI 模型。"""

    def __init__(self, model_name: str, max_retries=2, cot_model: bool = True):
        """初始化 OpenAI 第一方客户端。"""
        api_key = os.getenv("OPENAI_API_KEY", "EMPTY")
        base_url = os.getenv("OPENAI_BASE_URL", "http://localhost:11434/v1") # 默认为本地ollama兼容的API地址
        self.client = openai.OpenAI(
            api_key=api_key,
            base_url=base_url,
            max_retries=1, # 客户端本身有1次重试，我们的包装器会增加更多重试
        )
        self.model_name = model_name
        self.max_retries = max_retries # generate 方法循环的重试次数
        self.cot_model = cot_model # Chain-of-Thought 模型标志

    def generate(
        self,
        messages: LLMMessages,
        max_tokens: int,
        system_prompt: str | None = None,
        temperature: float = 0.0,
        tools: list[ToolParam] = [],
        tool_choice: dict[str, str] | None = None,
        thinking_tokens: int | None = None, # OpenAI 通常不直接使用此参数
    ) -> Tuple[list[AssistantContentBlock], dict[str, Any]]:
        """生成回复。"""
        assert thinking_tokens is None, "thinking_tokens 参数未针对OpenAI实现"

        openai_messages: List[Dict[str, Any]] = [] # 用于存储转换后的 OpenAI 格式消息列表

        if system_prompt is not None:
            # 此处的逻辑是，如果 messages 中已经有 system prompt，则不重复添加
            # 否则，将提供的 system_prompt 作为第一条消息。
            # 标准做法通常是在调用此方法前就将 system_prompt 整合进 LLMMessages，
            # 或者 OpenAI Python 客户端直接支持 `system` 参数（v1.x.x 中是通过 messages 实现的）。
            # 为简化，我们假设 messages 不包含 system_prompt，而是通过 system_prompt 参数传入。
            openai_messages.append({"role": "system", "content": system_prompt})

        current_turn_idx_for_role_assignment = 0 # 用于在非工具结果回合中交替 user/assistant 角色

        for message_list_item in messages: # message_list_item 是单个回合 (即 list[GeneralContentBlock])

            # --- 修改开始：正确处理完全由工具结果组成的回合 ---
            # 检查当前回合中的所有消息块是否都是 ToolFormattedResult 类型
            all_blocks_are_tool_results = all(isinstance(block, ToolFormattedResult) for block in message_list_item)

            if all_blocks_are_tool_results and message_list_item: # 确保列表不为空
                # 如果当前回合完全由工具结果组成，则将其展开为多条 'tool' 角色的API消息
                for tool_result_block_item in message_list_item:
                    tool_result_block = cast(ToolFormattedResult, tool_result_block_item)
                    # 确保 tool_output 是字符串，因为OpenAI的tool角色的content字段期望的是字符串
                    content_for_tool_role = str(tool_result_block.tool_output)
                    tool_call_id_for_msg = tool_result_block.tool_call_id
                    openai_messages.append({
                        "role": "tool",
                        "content": content_for_tool_role,
                        "tool_call_id": tool_call_id_for_msg
                    })
                # 这个来自历史记录的回合已经被作为工具消息处理完毕。
                # 我们仍然增加 current_turn_idx_for_role_assignment，因为历史记录中的一个回合已经被消费了。
                # 这能保持后续非工具回合的 user/assistant 角色顺序的正确性。
                current_turn_idx_for_role_assignment += 1
                continue # 继续处理历史记录中的下一个 message_list_item
            # --- 修改结束 ---

            # 如果不是完全由工具结果组成的回合，则执行原有的 user/assistant 角色处理逻辑
            role: str
            if current_turn_idx_for_role_assignment % 2 == 0: # 用户回合
                role = "user"
            else: # 助手回合
                role = "assistant"

            current_openai_message_parts: List[Dict[str, Any]] = [] # 用于存储当前回合消息的各个内容部分
            current_openai_tool_calls_for_assistant: List[Dict[str, Any]] = [] # 用于存储助手消息中的工具调用

            for internal_message_block in message_list_item: # 遍历回合中的每个具体内容块
                if isinstance(internal_message_block, TextPrompt):
                    current_openai_message_parts.append({"type": "text", "text": internal_message_block.text})
                elif isinstance(internal_message_block, ImageBlock):
                    # 确保 ImageBlock.source 结构正确并包含 'media_type' 和 'data'
                    if not (isinstance(internal_message_block.source, dict) and \
                            "media_type" in internal_message_block.source and \
                            "data" in internal_message_block.source):
                        # 记录警告并跳过格式不正确的 ImageBlock
                        print(f"警告：ImageBlock.source 格式不正确: {internal_message_block.source} (角色: '{role}')。将跳过此图片。")
                        continue
                    current_openai_message_parts.append({
                        "type": "image_url", # OpenAI 使用 "image_url" 类型处理图片
                        "image_url": {
                            # 假设 data 已经是 base64 编码的字符串
                            "url": f"data:{internal_message_block.source['media_type']};base64,{internal_message_block.source['data']}"
                        }
                    })
                elif isinstance(internal_message_block, TextResult): # 助手文本回复
                    current_openai_message_parts.append({"type": "text", "text": internal_message_block.text})
                elif isinstance(internal_message_block, ToolCall): # 助手请求工具调用
                    # ToolCall 块应该只出现在助手回合
                    if role != "assistant":
                        print(f"警告：在非助手角色 ('{role}') 中发现 ToolCall 块。这不符合常规。将按助手角色处理。")

                    # 将工具输入参数序列化为 JSON 字符串
                    tool_input_str = json.dumps(internal_message_block.tool_input)
                    current_openai_tool_calls_for_assistant.append({
                        "type": "function", # OpenAI 的工具调用类型通常是 'function'
                        "id": internal_message_block.tool_call_id, # 工具调用 ID
                        "function": {
                            "name": internal_message_block.tool_name,      # 工具名称
                            "arguments": tool_input_str,                  # 工具参数 (JSON 字符串)
                        },
                    })
                elif isinstance(internal_message_block, ToolFormattedResult):
                    # 如果之前的 'all_blocks_are_tool_results' 检查有效，理想情况下不应执行到这里。
                    # 如果执行到这里，意味着 ToolFormattedResult 与其他类型的消息块混合在了一个 user/assistant 回合中。
                    print(f"警告（混合回合）：在角色 '{role}' 的回合中发现 ToolFormattedResult。这通常是不期望的。工具名: {internal_message_block.tool_name}")
                    if role == "user": # 尝试通过转换为文本来进行补救
                         current_openai_message_parts.append({"type": "text", "text": f"[来自工具 {internal_message_block.tool_name} 的结果内容（混合回合警告）: {str(internal_message_block.tool_output)}]"})
                else:
                    # 对于未识别或未处理的消息块类型，打印警告。
                    print(f"警告：在角色 '{role}' 的回合中跳过未知/未处理的消息块类型: {type(internal_message_block)}。")

            # 为当前回合构建最终的 OpenAI 消息对象
            openai_single_message: Dict[str, Any] = {"role": role}
            if current_openai_message_parts:
                openai_single_message["content"] = current_openai_message_parts
            elif role == "assistant" and current_openai_tool_calls_for_assistant:
                # 如果是助手回合且只有工具调用，OpenAI 允许 content 为 null 或不提供 content 字段。
                openai_single_message["content"] = None
            elif role == "user" and not current_openai_message_parts:
                # 用户回合内容为空可能导致 API 错误。
                print(f"错误：用户回合 {current_turn_idx_for_role_assignment} 没有内容部分。这很可能会导致 API 错误。")
                # 添加一个占位符以尝试防止 API 错误，但这表明上游逻辑存在问题。
                openai_single_message["content"] = [{"type": "text", "text": "[错误：用户回合内容为空]"}]


            if current_openai_tool_calls_for_assistant: # 仅适用于助手消息
                openai_single_message["tool_calls"] = current_openai_tool_calls_for_assistant

            openai_messages.append(openai_single_message) # 将构建好的消息添加到列表中
            current_turn_idx_for_role_assignment += 1 # 递增回合计数器

        # --- OpenAI API 调用参数准备 ---

        # 处理工具选择 (tool_choice) 参数
        tool_choice_param: Any = OpenAI_NOT_GIVEN # 默认为不指定
        if tool_choice is not None:
            if tool_choice["type"] == "any":
                # OpenAI 中 'any' 通常对应 'required' (强制模型调用一个函数)
                tool_choice_param = "required"
            elif tool_choice["type"] == "auto":
                tool_choice_param = "auto" # 模型自动决定是否调用工具
            elif tool_choice["type"] == "tool": # 指定调用特定工具
                tool_choice_param = {
                    "type": "function",
                    "function": {"name": tool_choice["name"]},
                }
            else:
                raise ValueError(f"未知的 tool_choice 类型: {tool_choice['type']}")

        # 处理工具定义 (tools) 参数
        openai_tools_param: Any = OpenAI_NOT_GIVEN # 默认为不提供工具
        if tools: # 如果提供了工具列表
            openai_tools_list = []
            for tool_param_from_input in tools: # tool_param_from_input 是 ToolParam 类型
                tool_definition_for_api = {
                    "name": tool_param_from_input.name,
                    "description": tool_param_from_input.description,
                    "parameters": tool_param_from_input.input_schema, # 工具的输入参数 JSON Schema
                }
                openai_tools_list.append({
                    "type": "function", # OpenAI 的工具类型通常是 'function'
                    "function": tool_definition_for_api,
                })
            openai_tools_param = openai_tools_list


        # --- 执行 OpenAI API 调用和重试逻辑 ---
        response = None
        last_exception = None
        for retry_attempt in range(self.max_retries + 1): # +1 是因为 range 不包含末尾，所以这样可以重试 max_retries 次
            try:
                api_call_params: Dict[str, Any] = { # 构造 API 调用参数字典
                    "model": self.model_name,
                    "messages": openai_messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                }

                # 如果提供了工具定义，则加入参数
                if openai_tools_param is not OpenAI_NOT_GIVEN:
                    api_call_params["tools"] = openai_tools_param
                # 如果指定了工具选择策略，则加入参数
                if tool_choice_param is not OpenAI_NOT_GIVEN:
                    api_call_params["tool_choice"] = tool_choice_param

                response = self.client.chat.completions.create(**api_call_params)
                break  # 如果调用成功，则跳出重试循环
            except (
                OpenAI_APIConnectionError, # API 连接错误
                OpenAI_InternalServerError, # OpenAI 服务器内部错误 (包括 502 Bad Gateway 等)
                OpenAI_RateLimitError, # API 速率限制错误
            ) as e:
                last_exception = e # 保存最后一次异常信息
                print(f"OpenAI API 请求失败 (尝试 {retry_attempt + 1}/{self.max_retries + 1}): {type(e).__name__} - {str(e)}")
                if retry_attempt == self.max_retries: # 如果已达到最大重试次数
                    print(f"经过 {self.max_retries + 1} 次尝试后，OpenAI 请求失败。")
                    raise e # 抛出最后一次异常
                else:
                    # 执行指数退避策略并增加随机抖动，以避免拥塞
                    sleep_duration = 10 * random.uniform(0.8, 1.2) * (2**retry_attempt)
                    print(f"将在 {sleep_duration:.2f} 秒后重试 OpenAI 请求...")
                    time.sleep(sleep_duration)
            except Exception as e: # 捕获在 API 调用期间发生的其他所有意外错误
                last_exception = e
                print(f"OpenAI API 请求期间发生意外错误 (尝试 {retry_attempt + 1}/{self.max_retries + 1}): {type(e).__name__} - {str(e)}")
                if retry_attempt == self.max_retries:
                    raise e # 在最后一次尝试后重新引发异常
                # 根据错误处理策略，可以应用类似的重试逻辑或立即重新引发
                time.sleep(10 * random.uniform(0.8, 1.2)) # 简单的固定时间间隔重试


        if response is None: # 如果所有重试都失败，response 仍然会是 None
            if last_exception:
                raise RuntimeError(f"所有重试后 OpenAI API 请求失败。最后错误: {str(last_exception)}") from last_exception
            else: # 理论上不应发生，因为 last_exception 应该总被设置
                raise RuntimeError("所有重试后 OpenAI API 请求因未知原因失败。")

        # --- 处理 OpenAI API 响应 ---
        internal_messages_result: List[AssistantContentBlock] = [] # 用于存储转换后的助手响应内容块

        if not response.choices:
            # API 返回了响应，但 choices 列表为空。这是一种不常见但可能的情况。
            print("警告：OpenAI 响应不包含任何 choices。返回空的助手回合。")
        else:
            openai_response_message = response.choices[0].message # 获取第一个选择的响应消息
            assistant_content_text = openai_response_message.content  # 文本内容，可以是字符串或 None
            response_tool_calls_api = openai_response_message.tool_calls # 工具调用列表，可以是列表或 None

            # 1. 处理文本内容 (如果有)
            if assistant_content_text:
                internal_messages_result.append(TextResult(text=assistant_content_text))

            # 2. 处理工具调用 (如果有)
            if response_tool_calls_api:
                for tool_call_api_obj in response_tool_calls_api:
                    if tool_call_api_obj.type == "function": # 确保是函数类型的工具调用
                        function_call_details = tool_call_api_obj.function
                        arguments_str = function_call_details.arguments
                        try:
                            tool_input_data = json.loads(arguments_str) # 解析参数 JSON 字符串
                        except json.JSONDecodeError as e:
                            # 如果参数解析失败，记录错误，并创建一个文本结果通知 Agent
                            error_message = f"为工具 '{function_call_details.name}' (ID: {tool_call_api_obj.id}) 解析 JSON 参数失败。参数: '{arguments_str}'。错误: {str(e)}"
                            print(error_message)
                            internal_messages_result.append(TextResult(text=f"[工具参数解析错误: {error_message}]"))
                            continue # 跳过这个格式错误的工具调用，继续处理其他工具调用

                        # 将 API 的工具调用对象转换为内部的 ToolCall 对象
                        internal_messages_result.append(
                            ToolCall(
                                tool_name=function_call_details.name,
                                tool_input=tool_input_data,
                                tool_call_id=tool_call_api_obj.id, # 保持 API 返回的 ID
                            )
                        )
                    else:
                        # 如果将来 OpenAI 支持其他类型的工具调用，在此处处理
                        print(f"警告：接收到不支持的工具调用类型: {tool_call_api_obj.type}")

        # --- 准备并返回元数据 ---
        # 检查 response.usage 是否为 None，以避免 AttributeError
        prompt_tokens = response.usage.prompt_tokens if response.usage else 0
        completion_tokens = response.usage.completion_tokens if response.usage else 0

        message_metadata = {
            "raw_response": response.model_dump(), # 存储完整的原始响应对象 (Pydantic 模型转字典)
            "input_tokens": prompt_tokens,
            "output_tokens": completion_tokens,
            "model_name": response.model, # API 实际使用的模型名称字符串
        }

        return internal_messages_result, message_metadata