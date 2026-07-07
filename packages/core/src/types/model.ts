export interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsReasoning: boolean;
  supportsStreaming: boolean;
  /** USD per million input tokens, if known */
  inputCostPerMTok?: number;
  /** USD per million output tokens, if known */
  outputCostPerMTok?: number;
}

/** Which role in the system a model has been assigned to. */
export type ModelRole = "plan" | "build" | "chat" | "vision" | "review" | "discord";

export type ModelAssignments = Partial<Record<ModelRole, string>>;
