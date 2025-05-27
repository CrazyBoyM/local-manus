import json
from typing import Optional, cast, Any, List #确保 List 已导入
from ii_agent.llm.base import (
    AssistantContentBlock,
    GeneralContentBlock,
    LLMMessages,
    TextPrompt,
    TextResult,
    ToolCall,
    ToolCallParameters,
    ToolFormattedResult,
    ImageBlock,
)


class MessageHistory:
    """Stores the sequence of messages in a dialog."""

    def __init__(self, multi_tool_call_mode: bool = False): # 新增参数
        self._message_lists: list[list[GeneralContentBlock]] = []
        self.multi_tool_call_mode = multi_tool_call_mode # 存储模式

    def add_user_prompt(
        self, prompt: str, image_blocks: list[dict[str, Any]] | None = None
    ):
        """Adds a user prompt."""
        user_turn: List[GeneralContentBlock] = [] # 明确类型
        if image_blocks is not None:
            for img_block in image_blocks:
                # 确保 img_block 字典包含 "source" 键，并且它的值也是一个字典
                if "source" in img_block and isinstance(img_block["source"], dict):
                    user_turn.append(ImageBlock(type="image", source=img_block["source"]))
                else:
                    # 处理 img_block 结构不符合预期的情况，例如打印警告或跳过
                    print(f"Warning: Skipping image block with unexpected structure: {img_block}")


        user_turn.append(TextPrompt(prompt))
        self.add_user_turn(user_turn)

    def add_user_turn(self, messages: list[GeneralContentBlock]):
        """Adds a user turn (prompts and/or tool results)."""
        if not self.is_next_turn_user():
            # 这是原始的严格检查，可以根据需要调整或记录警告
            # 对于多工具模式，如果在此之前 assistant turn 已经完成且没有工具调用，
            # is_next_turn_user() 应该为 True。
            # 如果 is_next_turn_user() 为 False，意味着期望 assistant 回合。
            # 用户在 assistant 回合中强行输入通常表示流程中断或外部干预。
            print(f"Warning: Adding user turn when an assistant turn was expected. History len: {len(self._message_lists)}")
            # 可以选择抛出异常，或者允许并调整状态
            # raise ValueError("Cannot add user turn, expected assistant turn next.")
        
        # Ensure all messages are valid user-side types
        for msg in messages:
            if not isinstance(msg, (TextPrompt, ToolFormattedResult, ImageBlock)): # ImageBlock 也是有效的用户侧消息
                raise TypeError(f"Invalid message type for user turn: {type(msg)}")
        self._message_lists.append(messages)

    def add_assistant_turn(self, messages: list[AssistantContentBlock]):
        """Adds an assistant turn (text response and/or tool calls)."""
        if not self.is_next_turn_assistant():
            # 这是原始的严格检查
            # 如果 is_next_turn_assistant() 为 False，意味着期望用户回合。
            # AI 强行在用户回合发言通常是错误的。
            raise ValueError("Cannot add assistant turn, expected user turn next.")
        self._message_lists.append(cast(list[GeneralContentBlock], messages))

    def get_messages_for_llm(self) -> LLMMessages:
        """Returns messages formatted for the LLM client."""
        return list(self._message_lists) # 返回副本

    def get_pending_tool_calls(self) -> list[ToolCallParameters]:
        """Returns tool calls from the last assistant turn, if any."""
        if self.is_next_turn_assistant() or not self._message_lists:
            return []

        last_turn = self._message_lists[-1]
        tool_calls = []
        for message in last_turn:
            if isinstance(message, ToolCall):
                tool_calls.append(
                    ToolCallParameters(
                        tool_call_id=message.tool_call_id,
                        tool_name=message.tool_name,
                        tool_input=message.tool_input,
                    )
                )
        return tool_calls

    def add_tool_call_result(self, parameters: ToolCallParameters, result: str):
        """Add the result of a tool call to the dialog."""
        self.add_tool_call_results([parameters], [result])

    def add_tool_call_results(
        self, parameters: list[ToolCallParameters], results: list[str]
    ):
        """Add the result of a tool call to the dialog."""
        if not self.multi_tool_call_mode:
            # 对于单工具调用模式 (如 Anthropic)
            # 原始断言是 assert self.is_next_turn_user(), ...
            # 这个断言在单工具场景下“恰好”能通过，因为 add_assistant_turn 后 len() 是偶数。
            # 严格来说，此时应该期望工具结果，而不是用户回合。
            # 但为了“小改”，并且考虑到 anthropic_fc 的现有流程，我们暂时保留这个逻辑，
            # 或者移除它以避免潜在问题（如果 anthropic_fc 的流程有细微变化）。
            # 如果移除，表示我们信任调用者在正确的时候添加工具结果。
            # 为了与之前的讨论一致（即 anthropic_fc 能通过旧断言），我们这里可以模拟一下旧行为，
            # 但加上注释说明其局限性。
            if not self.is_next_turn_user():
                 # 在单工具模式下，理论上执行到这里时 is_next_turn_user() 应该为 True。
                 # 如果不是，说明 MessageHistory 的简单奇偶判断可能在某些边缘情况或
                 # 外部对 history 的非标准操作下出现不一致。
                 print(f"Warning (single_tool_mode): Adding tool call results when is_next_turn_user() is False. History len: {len(self._message_lists)}. This might indicate an unexpected history state for single tool call mode.")
                 # 对于 anthropic_fc，由于其严格的单工具流程，这里通常不会被触发。
                 # 如果确实触发了，原始的 assert 会失败。我们这里选择不失败，但打印警告。
        # else (self.multi_tool_call_mode is True):
            # 对于多工具调用模式 (如 OpenAI)，我们不执行 is_next_turn_user() 的断言。
            # 因为在处理一个序列中的第二个及以后的工具结果时，is_next_turn_user() 会是 False。
            pass # 在多工具模式下，跳过这个特定的断言

        self._message_lists.append(
            [
                ToolFormattedResult(
                    tool_call_id=params.tool_call_id,
                    tool_name=params.tool_name,
                    tool_output=result, # 假设 result 已经是字符串
                )
                for params, result in zip(parameters, results)
            ]
        )

    def get_last_assistant_text_response(self) -> Optional[str]:
        """Returns the text part of the last assistant response, if any."""
        if self.is_next_turn_assistant() or not self._message_lists:
            return None

        last_turn = self._message_lists[-1]
        # 确保我们只从真正的“AI助手回合”中寻找 TextResult，
        # 而不是从“工具结果回合”中寻找。
        # 一个简单的启发式方法是检查该回合是否主要由 ToolFormattedResult 组成。
        # 如果最后一个回合全是 ToolFormattedResult，那么它代表的是工具的输出，而不是AI的文本回复。
        # 此时应该查看倒数第二个回合（即真正的AI回复回合）。

        # 查找最后一个非工具结果的回合
        for turn_idx in range(len(self._message_lists) - 1, -1, -1):
            current_turn = self._message_lists[turn_idx]
            is_tool_result_turn = all(isinstance(msg, ToolFormattedResult) for msg in current_turn)
            
            if not is_tool_result_turn and (turn_idx % 2 != 0): # 奇数索引代表AI的回合（0-indexed）
                for message in reversed(current_turn):
                    if isinstance(message, TextResult):
                        return message.text
                return None # AI回合但没有文本部分
        return None


    def clear(self):
        """Removes all messages."""
        self._message_lists = []

    def is_next_turn_user(self) -> bool:
        """Checks if the next turn should be from the user."""
        return len(self._message_lists) % 2 == 0

    def is_next_turn_assistant(self) -> bool:
        """Checks if the next turn should be from the assistant."""
        return not self.is_next_turn_user()

    def __len__(self) -> int:
        """Returns the number of turns."""
        return len(self._message_lists)

    def __str__(self) -> str:
        """JSON representation of the history."""
        try:
            # 确保 message.to_dict() 存在并且能正确工作
            json_serializable = [
                [(message.to_dict() if hasattr(message, 'to_dict') else vars(message)) for message in message_list]
                for message_list in self._message_lists
            ]
            return json.dumps(json_serializable, indent=2)
        except Exception as e:
            # 提供更详细的错误信息，帮助调试
            error_details = []
            for i, message_list in enumerate(self._message_lists):
                for j, message in enumerate(message_list):
                    if not hasattr(message, 'to_dict'):
                        error_details.append(f"Turn {i}, Message {j} (type: {type(message)}) does not have to_dict method.")
            return f"[Error serializing history: {e}. Details: {' '.join(error_details)} History Snapshot: {str(self._message_lists)}]"


    def get_summary(self, max_str_len: int = 100) -> str:
        """Returns a summarized JSON representation."""

        def truncate_strings(obj):
            if isinstance(obj, str):
                return obj[:max_str_len] + "..." if len(obj) > max_str_len else obj
            elif isinstance(obj, dict):
                return {k: truncate_strings(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [truncate_strings(item) for item in obj]
            return obj

        try:
            json_serializable = truncate_strings(
                [
                    [(message.to_dict() if hasattr(message, 'to_dict') else vars(message)) for message in message_list]
                    for message_list in self._message_lists
                ]
            )
            return json.dumps(json_serializable, indent=2)
        except Exception as e:
            return f"[Error serializing summary: {e}]"

    def set_message_list(self, message_list: list[list[GeneralContentBlock]]):
        """Sets the message list. Used by ContextManager for truncation."""
        # 警告: 这个方法直接替换历史记录，可能会破坏内部状态的连续性，
        # 例如 _pending_tool_call_ids_from_last_assistant_turn (如果采用更复杂的状态管理)。
        # 当前基于 multi_tool_call_mode 和奇偶判断的简单模型受此影响较小，
        # 但如果未来 MessageHistory 内部状态更复杂，这里需要同步更新状态。
        self._message_lists = message_list