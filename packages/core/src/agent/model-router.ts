import type { ModelAssignments, ModelRole } from "../types/model.js";
import type { CompleteOptions, CompleteResult } from "../providers/provider.js";
import { ProviderRegistry } from "../providers/provider-registry.js";
import { inferProviderId } from "../providers/default-registry.js";
import type { AgentMode } from "./agent-loop.js";

export interface ModelRouterConfig {
  registry: ProviderRegistry;
  /** Per-role model overrides. Falls back to defaultModel for unset roles. */
  assignments: ModelAssignments;
  /** Fallback model when a role has no assignment. */
  defaultModel: string;
  /** Fallback provider; derived from defaultModel if not set. */
  defaultProviderId?: string;
}

/**
 * Routes a completion request to the correct provider and model for a given
 * role. This is what enables "use Claude Opus for planning but GPT-5 Mini
 * for building" without the agent loop needing to care which provider is
 * active at any given moment.
 */
export class ModelRouter {
  private readonly registry: ProviderRegistry;
  private readonly assignments: ModelAssignments;
  private readonly defaultModel: string;
  private readonly defaultProviderId: string;

  constructor(config: ModelRouterConfig) {
    this.registry = config.registry;
    this.assignments = config.assignments;
    this.defaultModel = config.defaultModel;
    this.defaultProviderId = config.defaultProviderId ?? inferProviderId(config.defaultModel);
  }

  modelForRole(role: ModelRole): string {
    return this.assignments[role] ?? this.defaultModel;
  }

  providerIdForRole(role: ModelRole): string {
    const model = this.modelForRole(role);
    return inferProviderId(model);
  }

  /** Convert AgentMode ("plan" | "build") to the appropriate ModelRole. */
  roleForMode(mode: AgentMode): ModelRole {
    return mode === "plan" ? "plan" : "build";
  }

  async complete(role: ModelRole, options: Omit<CompleteOptions, "model">): Promise<CompleteResult> {
    const model = this.modelForRole(role);
    const providerId = this.providerIdForRole(role);
    return this.registry.complete(providerId, { ...options, model });
  }

  /** Convenience: complete for an agent mode directly. */
  async completeForMode(mode: AgentMode, options: Omit<CompleteOptions, "model">): Promise<CompleteResult> {
    return this.complete(this.roleForMode(mode), options);
  }

  summary(): Record<ModelRole, { model: string; provider: string }> {
    const roles: ModelRole[] = ["plan", "build", "chat", "vision", "review", "discord"];
    return Object.fromEntries(
      roles.map((role) => [role, { model: this.modelForRole(role), provider: this.providerIdForRole(role) }]),
    ) as Record<ModelRole, { model: string; provider: string }>;
  }
}

/** Build a ModelRouter from a simple string config like "plan=claude-opus-4-7,build=gpt-5-mini" */
export function parseModelAssignments(spec: string): ModelAssignments {
  const assignments: ModelAssignments = {};
  for (const part of spec.split(",")) {
    const [role, model] = part.trim().split("=");
    if (role && model) {
      assignments[role.trim() as ModelRole] = model.trim();
    }
  }
  return assignments;
}
