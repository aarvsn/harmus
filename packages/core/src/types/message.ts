/**
 * Core chat message types used across all providers.
 * Providers translate to/from this shape so the rest of Harmus
 * never needs to know about OpenAI vs Anthropic vs Gemini wire formats.
 */

export type Role = "system" | "user" | "assistant" | "tool";

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ImageBlock {
  type: "image";
  /** base64-encoded image data */
  data: string;
  mimeType: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export type ContentBlock = TextBlock | ImageBlock | ToolUseBlock | ToolResultBlock;

export interface Message {
  role: Role;
  content: ContentBlock[];
}

export function textMessage(role: Role, text: string): Message {
  return { role, content: [{ type: "text", text }] };
}

export function userText(text: string): Message {
  return textMessage("user", text);
}

export function assistantText(text: string): Message {
  return textMessage("assistant", text);
}
