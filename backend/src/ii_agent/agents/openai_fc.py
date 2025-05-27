import asyncio
import logging
from typing import Any, Optional, List # 确保 List 已导入
import uuid
import json # 确保 json 已导入

from fastapi import WebSocket # 如果 WebSocket 被使用，则保留，尽管在多工具逻辑中不直接使用
from ii_agent.agents.base import BaseAgent
from ii_agent.core.event import EventType, RealtimeEvent
from ii_agent.llm.base import LLMClient, TextResult, ToolCall, ToolCallParameters # 确保 ToolCallParameters 已导入
from ii_agent.llm.context_manager.base import ContextManager
from ii_agent.llm.message_history import MessageHistory
from ii_agent.tools.base import ToolImplOutput,LLMTool 
from ii_agent.tools.utils import encode_image
from ii_agent.db.manager import DatabaseManager
from ii_agent.tools import AgentToolManager
from ii_agent.utils.constants import COMPLETE_MESSAGE
from ii_agent.utils.workspace_manager import WorkspaceManager


class OpenAIFC(BaseAgent): # 类名可能是用词不当，如果客户端是 OpenAI
    name = "general_agent"
    description = """\
A general agent that can accomplish tasks and answer questions.

If you are faced with a task that involves more than a few steps, or if the task is complex, or if the instructions are very long,
try breaking down the task into smaller steps. After call this tool to update or create a plan, use write_file or str_replace_tool to update the plan to todo.md
""" # 一个通用的代理，可以完成任务并回答问题。如果你面临的任务涉及多个步骤，或者任务复杂，或者指令很长，尝试将任务分解为更小的步骤。在调用此工具更新或创建计划后，使用 write_file 或 str_replace_tool 更新 todo.md 中的计划。
    input_schema = {
        "type": "object",
        "properties": {
            "instruction": {
                "type": "string",
                "description": "The instruction to the agent.", # 对代理的指令。
            },
            "files": { # 'files' 之前在 run_impl 中但不在 input_schema 中。如果此 schema 被工具本身使用，则为保持一致性而添加。
                "type": "array",
                "items": {"type": "string"},
                "description": "A list of file paths relevant to the instruction.", # 与指令相关的文件路径列表。
                "default": []
            }
        },
        "required": ["instruction"],
    }
    websocket: Optional[WebSocket]

    def __init__(
        self,
        system_prompt: str,
        client: LLMClient,
        tools: List[LLMTool], 
        workspace_manager: WorkspaceManager,
        message_queue: asyncio.Queue, # 用于 RealtimeEvent
        logger_for_agent_logs: logging.Logger,
        context_manager: ContextManager,
        max_output_tokens_per_turn: int = 8192,
        max_turns: int = 10,
        websocket: Optional[WebSocket] = None,
        session_id: Optional[uuid.UUID] = None,
    ):
        super().__init__()
        self.workspace_manager = workspace_manager
        self.system_prompt = system_prompt
        self.client = client # 这是 LLMClient，例如 OpenAIDirectClient
        self.tool_manager = AgentToolManager(
            tools=tools,
            logger_for_agent_logs=logger_for_agent_logs,
        )

        self.logger_for_agent_logs = logger_for_agent_logs
        self.max_output_tokens = max_output_tokens_per_turn
        self.max_turns = max_turns

        self.interrupted = False # 标记是否被中断
        self.history = MessageHistory(multi_tool_call_mode=True) # 消息历史记录，为OpenAI启用多工具调用模式
        self.context_manager = context_manager # 上下文管理器
        self.session_id = session_id # 会话ID
        self.db_manager = DatabaseManager() # 数据库管理器
        self.message_queue = message_queue # 消息队列
        self.websocket = websocket # WebSocket连接 (可选)

    async def _process_messages(self):
        # 此方法似乎用于处理传入的 WebSocket 消息或内部队列
        # 与多工具调用逻辑不直接相关，因此保持原样。
        try:
            while True:
                try:
                    message: RealtimeEvent = await self.message_queue.get()
                    if self.session_id is not None:
                        self.db_manager.save_event(self.session_id, message) # 保存事件到数据库
                    else:
                        self.logger_for_agent_logs.info(
                            f"No session ID, skipping event: {message}" # 没有会话ID，跳过事件
                        )

                    if (
                        message.type != EventType.USER_MESSAGE # 如果不是用户消息
                        and self.websocket is not None # 且 WebSocket 连接存在
                    ):
                        try:
                            await self.websocket.send_json(message.model_dump()) # 通过 WebSocket 发送消息
                        except Exception as e:
                            self.logger_for_agent_logs.warning(
                                f"Failed to send message to websocket: {str(e)}" # 发送消息到 websocket 失败
                            )
                            self.websocket = None # 在 WebSocket 损坏时阻止进一步尝试
                    self.message_queue.task_done() # 标记消息已处理
                except asyncio.CancelledError:
                    self.logger_for_agent_logs.info("Message processor task cancelled.") # 消息处理器任务已取消。
                    break
                except Exception as e:
                    self.logger_for_agent_logs.error(
                        f"Error processing message in queue: {str(e)}", exc_info=True # 处理队列中的消息时出错
                    )
        except asyncio.CancelledError:
            self.logger_for_agent_logs.info("Message processor stopped") # 消息处理器已停止
        except Exception as e:
            self.logger_for_agent_logs.error(f"Critical error in message processor: {str(e)}", exc_info=True) # 消息处理器发生严重错误


    def _validate_tool_parameters(self):
        """Validate tool parameters and check for duplicates.""" # 验证工具参数并检查重复项。
        tool_params = [tool.get_tool_param() for tool in self.tool_manager.get_tools()]
        tool_names = [param.name for param in tool_params]
        if len(tool_names) != len(set(tool_names)):
            # 找出重复的名称以提供更好的错误消息
            counts = {name: tool_names.count(name) for name in tool_names}
            duplicates = [name for name, count in counts.items() if count > 1]
            raise ValueError(f"Duplicate tool names found: {list(set(duplicates))}") # 发现重复的工具名称
        return tool_params

    def start_message_processing(self):
        """Start processing the message queue.""" # 开始处理消息队列。
        return asyncio.create_task(self._process_messages())

    def run_impl(
        self,
        tool_input: dict[str, Any], # 这是如果 Agent 本身作为工具运行时接收的输入
        message_history: Optional[MessageHistory] = None, # 这在当前的 run_impl 中似乎未使用，它使用的是 self.history
    ) -> ToolImplOutput:
        instruction = tool_input["instruction"]
        files = tool_input.get("files", []) or [] # 确保 files 是一个列表

        user_input_delimiter = "-" * 45 + " USER INPUT " + "-" * 45 + "\n" + instruction
        self.logger_for_agent_logs.info(f"\n{user_input_delimiter}\n")

        current_instruction = instruction # 保留原始指令，与增强后的指令分开
        image_blocks_for_llm: List[dict] = [] # 明确定义类型

        if files:
            augmented_instruction = f"{current_instruction}\n\nAttached files:\n" # 附加文件：
            for file_path_str in files:
                try:
                    relative_path = self.workspace_manager.relative_path(file_path_str)
                    augmented_instruction += f" - {relative_path}\n"
                    self.logger_for_agent_logs.info(f"Attached file (for context): {relative_path}") # 附加文件（用于上下文）：

                    ext = file_path_str.split(".")[-1].lower()
                    if ext == "jpg": ext = "jpeg" # 规范化常见扩展名
                    if ext in ["png", "gif", "jpeg", "webp"]:
                        absolute_file_path = self.workspace_manager.workspace_path(file_path_str)
                        base64_image = encode_image(str(absolute_file_path))
                        image_blocks_for_llm.append(
                            {
                                "type": "image", # 更标准的多模态消息类型
                                "source": {
                                    "type": "base64",
                                    "media_type": f"image/{ext}",
                                    "data": base64_image,
                                }
                            }
                        )
                except Exception as e:
                    self.logger_for_agent_logs.error(f"Error processing file {file_path_str}: {e}", exc_info=True) # 处理文件时出错
                    augmented_instruction += f" - Error processing file {file_path_str}\n" # 处理文件时出错

            current_instruction = augmented_instruction.strip()

        # 将用户输入添加到历史记录
        # history 对象应该能够处理多模态输入 (文本 + image_blocks)
        self.history.add_user_prompt(current_instruction, image_blocks_for_llm)
        self.interrupted = False

        remaining_turns = self.max_turns # 剩余回合数
        while remaining_turns > 0:
            remaining_turns -= 1
            self.logger_for_agent_logs.info(f"\n{'-'*45} NEW TURN (Remaining: {remaining_turns}) {'-'*45}\n") # 新回合 (剩余: ...)

            # *** 修改：在生成响应之前检查是否轮到助手 ***
            if not self.history.is_next_turn_assistant():
                self.logger_for_agent_logs.warning(
                    "Agent run loop: Expected assistant's turn, but it's user's turn. "
                    "This might happen if the previous assistant turn didn't call tools. "
                    "The agent should typically wait for user input or conclude."
                ) # Agent 运行循环：期望助手回合，但现在是用户回合。这可能发生在之前的助手回合没有调用工具的情况下。Agent 通常应该等待用户输入或结束。
                final_text = self.history.get_last_assistant_text_response() or "Task seems complete, or I am waiting for further instructions." # 任务似乎已完成，或者我正在等待进一步的指示。
                self.message_queue.put_nowait(
                    RealtimeEvent(type=EventType.AGENT_RESPONSE, content={"text": final_text})
                )
                return ToolImplOutput(
                    tool_output=final_text,
                    tool_result_message="Agent loop ended: not assistant's turn." # Agent 循环结束：非助手回合。
                )

            all_tool_params = self._validate_tool_parameters() # 获取所有有效的工具参数

            try:
                current_messages_for_llm = self.history.get_messages_for_llm()
                # Token 计数和截断逻辑 - 假设它能正确工作
                current_tok_count = self.context_manager.count_tokens(current_messages_for_llm)
                self.logger_for_agent_logs.info(f"(Token count before truncation: {current_tok_count})\n") # (截断前 Token 计数: ...)
                truncated_messages_for_llm = self.context_manager.apply_truncation_if_needed(current_messages_for_llm)
                if len(current_messages_for_llm) != len(truncated_messages_for_llm):
                     self.logger_for_agent_logs.info(f"(Token count after truncation: {self.context_manager.count_tokens(truncated_messages_for_llm)})\n") # (截断后 Token 计数: ...)
                self.history.set_message_list(truncated_messages_for_llm) # 如果截断，则更新历史记录


                # model_response_blocks 将是 List[AssistantContentBlock]
                model_response_blocks, _ = self.client.generate(
                    messages=truncated_messages_for_llm,
                    max_tokens=self.max_output_tokens,
                    tools=all_tool_params,
                    system_prompt=self.system_prompt,
                )

                if not model_response_blocks: # LLM 返回空响应
                    self.logger_for_agent_logs.info("LLM returned an empty response. Assuming task completion or waiting for user.") # LLM 返回了一个空响应。假设任务完成或等待用户。
                    # 如果为空，history.add_assistant_turn 将添加一个空的助手回合。
                    # pending_tool_calls 将为空。
                    pass # 允许空的 model_response_blocks

                self.history.add_assistant_turn(model_response_blocks) # 将助手响应添加到历史记录

                # 提取并记录助手响应的文本部分
                assistant_text_response = ""
                for block in model_response_blocks:
                    if isinstance(block, TextResult):
                        assistant_text_response += block.text + "\n"
                if assistant_text_response:
                    self.logger_for_agent_logs.info(
                        f"Assistant text part of turn: {assistant_text_response.strip()}" # 回合的助手文本部分：
                    )
                    self.message_queue.put_nowait(
                        RealtimeEvent(
                            type=EventType.AGENT_THINKING, # 或者 AGENT_RESPONSE 如果是最终文本
                            content={"text": assistant_text_response.strip()},
                        )
                    )

                # 从历史记录中获取待处理的工具调用
                pending_tool_calls = self.history.get_pending_tool_calls()

                if not pending_tool_calls: # 如果没有工具被调用
                    self.logger_for_agent_logs.info("[No tools were called by LLM this turn]") # [本回合 LLM 未调用任何工具]
                    final_text = assistant_text_response.strip() if assistant_text_response else self.history.get_last_assistant_text_response()
                    if not final_text or final_text == COMPLETE_MESSAGE: # 如果 LLM 在用户输入后仅说了 "COMPLETE" 或什么都没说
                        final_text = "Task seems complete, or I have no further actions." # 任务似乎已完成，或者我没有进一步的操作。
                    
                    self.message_queue.put_nowait(
                        RealtimeEvent(
                            type=EventType.AGENT_RESPONSE,
                            content={"text": final_text},
                        )
                    )
                    return ToolImplOutput(
                        tool_output=final_text,
                        tool_result_message="Task ended: No tools called by LLM.", # 任务结束：LLM 未调用任何工具。
                    )

                self.logger_for_agent_logs.info(f"LLM requested {len(pending_tool_calls)} tool(s). Executing sequentially...") # LLM 请求了 ... 个工具。按顺序执行...

                # *** 修改开始：在添加到历史记录之前收集所有工具结果 ***
                collected_tool_call_params: List[ToolCallParameters] = [] # 收集的工具调用参数
                collected_tool_results: List[str] = [] # 收集的工具结果
                stop_agent_due_to_tool = False # 工具是否发出停止代理的信号
                final_answer_from_tool_run = None # 工具运行得出的最终答案

                for tool_call_obj in pending_tool_calls:
                    if self.interrupted or stop_agent_due_to_tool: # 如果批处理中的前一个工具导致中断/停止
                        # 如果需要，为跳过的工具添加占位符结果或仅记录日志
                        collected_tool_call_params.append(tool_call_obj)
                        collected_tool_results.append(f"Tool {tool_call_obj.tool_name} execution skipped due to prior interruption or stop signal.") # 由于先前的中断或停止信号，工具 ... 的执行已跳过。
                        self.logger_for_agent_logs.warning(f"Skipping tool {tool_call_obj.tool_name} due to prior interruption/stop.") # 由于先前的中断/停止，跳过工具 ...。
                        continue

                    self.logger_for_agent_logs.info(
                        f"Executing tool: {tool_call_obj.tool_name} (ID: {tool_call_obj.tool_call_id}) "
                        f"Input: {json.dumps(tool_call_obj.tool_input, indent=2)}"
                    ) # 执行工具：... (ID: ...) 输入：...
                    self.message_queue.put_nowait(
                        RealtimeEvent(
                            type=EventType.TOOL_CALL,
                            content={
                                "tool_call_id": tool_call_obj.tool_call_id,
                                "tool_name": tool_call_obj.tool_name,
                                "tool_input": tool_call_obj.tool_input,
                            },
                        )
                    )

                    tool_result_str: str = ""
                    try:
                        # 传递 self.history，但要注意其状态。
                        # LLMTool.run 中的断言是这里的主要问题。
                        # 目前，我们传递 self.history 并假设 LLMTool.run 中的断言已放宽/移除。
                        tool_result_str = str(self.tool_manager.run_tool(tool_call_obj, self.history))
                        
                        # 为此特定工具发送 TOOL_RESULT 事件
                        self.message_queue.put_nowait(
                            RealtimeEvent(
                                type=EventType.TOOL_RESULT,
                                content={
                                    "tool_call_id": tool_call_obj.tool_call_id,
                                    "tool_name": tool_call_obj.tool_name,
                                    "result": tool_result_str, # 确保这是可序列化的
                                },
                            )
                        )
                        self.logger_for_agent_logs.info(f"Tool {tool_call_obj.tool_name} (ID: {tool_call_obj.tool_call_id}) executed.") # 工具 ... (ID: ...) 已执行。

                        if self.tool_manager.should_stop(): # 如果工具管理器指示停止
                            final_answer_from_tool_run = self.tool_manager.get_final_answer()
                            self.logger_for_agent_logs.info(
                                f"Tool {tool_call_obj.tool_name} signaled task completion. {final_answer_from_tool_run}" # 工具 ... 发出任务完成信号。
                            )
                            stop_agent_due_to_tool = True
                            # 此工具的结果仍将在下面添加。此迭代后循环将中断。
                    
                    except KeyboardInterrupt: # 处理此特定工具的中断
                        self.interrupted = True
                        interrupt_msg = f"Tool {tool_call_obj.tool_name} (ID: {tool_call_obj.tool_call_id}) execution interrupted by user." # 工具 ... (ID: ...) 的执行被用户中断。
                        self.logger_for_agent_logs.warning(interrupt_msg)
                        tool_result_str = interrupt_msg 
                    except Exception as e: # 处理此特定工具的错误
                        error_msg = f"Error executing tool {tool_call_obj.tool_name} (ID: {tool_call_obj.tool_call_id}): {str(e)}" # 执行工具 ... (ID: ...) 时出错：...
                        self.logger_for_agent_logs.error(error_msg, exc_info=True)
                        tool_result_str = error_msg
                        self.message_queue.put_nowait(
                             RealtimeEvent(
                                type=EventType.ERROR, # 工具错误的特定事件
                                content={
                                    "tool_call_id": tool_call_obj.tool_call_id,
                                    "tool_name": tool_call_obj.tool_name,
                                    "error": error_msg,
                                },
                            )
                        )
                        # 决定一个工具失败是否停止批处理。目前，它会收集错误并继续。
                    
                    collected_tool_call_params.append(tool_call_obj) # 收集工具调用参数
                    collected_tool_results.append(tool_result_str) # 收集工具结果

                    if stop_agent_due_to_tool or self.interrupted: # 如果因为工具或中断需要停止
                        break # 退出 pending_tool_calls 的循环

                # 将所有收集到的结果作为单个历史回合添加
                if collected_tool_call_params:
                    self.history.add_tool_call_results(collected_tool_call_params, collected_tool_results)
                    self.logger_for_agent_logs.info("All tool results for this turn batch added to history.") # 本回合批处理的所有工具结果已添加到历史记录。
                
                if stop_agent_due_to_tool: # 如果是工具发出的停止信号
                    self.history.add_assistant_turn([TextResult(text=COMPLETE_MESSAGE)]) # 用于下一回合状态
                    self.message_queue.put_nowait(
                        RealtimeEvent(type=EventType.AGENT_RESPONSE, content={"text": final_answer_from_tool_run})
                    )
                    return ToolImplOutput(
                        tool_output=final_answer_from_tool_run,
                        tool_result_message="Task completed: A tool signaled to stop.", # 任务完成：一个工具发出停止信号。
                    )
                
                if self.interrupted: # 检查在工具循环中是否发生中断
                    interrupt_msg_for_output = "Tool execution was interrupted." # 工具执行被中断。
                    self.history.add_assistant_turn([TextResult(text=interrupt_msg_for_output)])
                    self.message_queue.put_nowait(
                        RealtimeEvent(type=EventType.AGENT_RESPONSE, content={"text": interrupt_msg_for_output})
                    )
                    return ToolImplOutput(tool_output=interrupt_msg_for_output, tool_result_message=interrupt_msg_for_output)
                # *** 修改结束 ***
                
                self.logger_for_agent_logs.info("All sequential tool calls for this turn processed.") # 本回合的所有顺序工具调用均已处理。
            
            except KeyboardInterrupt: # 在 LLM 调用或工具循环外的代理逻辑中发生中断
                self.interrupted = True
                interrupt_msg = "Agent run interrupted by user." # Agent 运行被用户中断。
                self.logger_for_agent_logs.warning(interrupt_msg)
                self.history.add_assistant_turn([TextResult(text="Agent interrupted. Provide new instruction to resume.")]) # Agent 已中断。提供新指令以继续。
                self.message_queue.put_nowait(
                    RealtimeEvent(type=EventType.AGENT_RESPONSE, content={"text": interrupt_msg})
                )
                return ToolImplOutput(tool_output=interrupt_msg, tool_result_message=interrupt_msg)
            except Exception as e: # 捕获回合中的其他意外错误
                error_str = str(e)
                self.logger_for_agent_logs.error(f"An unexpected error occurred in agent turn: {error_str}", exc_info=True) # Agent 回合中发生意外错误：
                # 将错误作为助手消息添加到历史记录，以便 LLM 知晓
                try:
                    self.history.add_assistant_turn([TextResult(text=f"An internal error occurred: {error_str}")]) # 发生内部错误：
                except ValueError as hist_err: # 捕获添加助手回合时可能发生的 ValueError
                     self.logger_for_agent_logs.error(f"Failed to add error to history: {hist_err}. History state might be inconsistent.") # 未能将错误添加到历史记录：...。历史状态可能不一致。
                     # 即使无法添加到历史记录，也尝试通知用户
                self.message_queue.put_nowait(
                    RealtimeEvent(type=EventType.AGENT_ERROR, content={"error": error_str})
                )
                # 根据严重性，可能需要返回或重新引发
                return ToolImplOutput(tool_output=f"Agent error: {error_str}", tool_result_message="Agent encountered an error.") # Agent 遇到错误。


        final_output_msg = "Agent did not complete within the maximum number of turns." # Agent 未在最大回合数内完成。
        self.logger_for_agent_logs.warning(final_output_msg)
        self.message_queue.put_nowait(
            RealtimeEvent(type=EventType.AGENT_RESPONSE, content={"text": final_output_msg})
        )
        return ToolImplOutput(tool_output=final_output_msg, tool_result_message=final_output_msg)

    def get_tool_start_message(self, tool_input: dict[str, Any]) -> str:
        # 此方法用于 Agent 本身作为工具运行时。
        # 'instruction' 键来自其自身的 input_schema。
        return f"Agent started with instruction: {tool_input.get('instruction', 'No instruction provided.')}" # Agent 已启动，指令：... (未提供指令。)

    def run_agent(
        self,
        instruction: str,
        files: list[str] | None = None,
        resume: bool = False,
        orientation_instruction: str | None = None, # 在 run_impl 中似乎未使用，但为保持签名一致性而保留
    ) -> str: # 方法签名暗示它返回 str，但 run_impl 返回 ToolImplOutput
        """Start or resume an agent run.
        Returns:
            The final string output from the agent's execution.
        """ # 开始或恢复 Agent 运行。返回：Agent 执行的最终字符串输出。
        self.tool_manager.reset() # 重置任何特定于工具的状态
        if resume: # 如果是恢复运行
            if not self.history.is_next_turn_user():
                # 此检查对于正确恢复非常重要。
                # 如果不是用户回合，恢复可能会导致意外行为。
                # 可以清除上一个助手回合或引发错误。
                self.logger_for_agent_logs.warning("Resuming agent, but it was not the user's turn. History might be inconsistent.") # 正在恢复 Agent，但之前并非用户回合。历史记录可能不一致。
        else: # 如果是新运行
            self.history.clear() # 清空历史记录
            self.interrupted = False # 重置中断状态

        agent_tool_input = {
            "instruction": instruction,
            "files": files if files is not None else [], # 确保 files 是一个列表
        }
        if orientation_instruction: # 在当前形式的 run_impl 中未使用
            agent_tool_input["orientation_instruction"] = orientation_instruction
        
        # BaseTool (Agent 继承自它) 的 run 方法调用 run_impl。
        # run_impl 返回 ToolImplOutput。我们需要提取字符串部分。
        tool_output_obj = self.run(tool_input=agent_tool_input, message_history=self.history) # self.history 被 run_impl 使用
        
        # 确保最终返回的是字符串，符合类型提示和通常的期望
        if isinstance(tool_output_obj, ToolImplOutput):
            if tool_output_obj.tool_output is not None:
                # 如果 tool_output 是列表（例如包含图片），将其转换为字符串表示形式
                if isinstance(tool_output_obj.tool_output, list):
                    # 对于列表输出，可以选择如何转换为字符串。例如，连接文本部分或返回摘要。
                    # 这里我们简单地将其转换为字符串。
                    return str(tool_output_obj.tool_output) 
                return str(tool_output_obj.tool_output)
            elif tool_output_obj.tool_result_message is not None:
                 return str(tool_output_obj.tool_result_message)
            else:
                return "Agent execution finished with no specific output." # Agent 执行完成，无特定输出。
        return str(tool_output_obj) # 后备方案，尽管它应该是 ToolImplOutput

    def clear(self):
        """Clear the dialog and reset interruption state.""" # 清除对话并重置中断状态。
        self.history.clear()
        self.interrupted = False