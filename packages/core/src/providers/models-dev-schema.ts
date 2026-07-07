import { z } from "zod";

/**
 * Schema for a single model entry as returned by https://models.dev/api.json
 * This is intentionally permissive (.passthrough / optional fields) because
 * models.dev is a community-maintained dataset and fields vary by model.
 */
const ModelsDevModelSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    attachment: z.boolean().optional(),
    reasoning: z.union([z.boolean(), z.object({}).passthrough()]).optional(),
    tool_call: z.boolean().optional(),
    knowledge: z.string().optional(),
    release_date: z.string().optional(),
    last_updated: z.string().optional(),
    modalities: z
      .object({
        input: z.array(z.string()).optional(),
        output: z.array(z.string()).optional(),
      })
      .optional(),
    cost: z
      .object({
        input: z.number().optional(),
        output: z.number().optional(),
        cache_read: z.number().optional(),
        cache_write: z.number().optional(),
      })
      .optional(),
    limit: z
      .object({
        context: z.number().optional(),
        output: z.number().optional(),
      })
      .optional(),
  })
  .passthrough();

const ModelsDevProviderSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    npm: z.string().optional(),
    api: z.string().optional(),
    env: z.array(z.string()).optional(),
    doc: z.string().optional(),
    models: z.record(z.string(), ModelsDevModelSchema).optional(),
  })
  .passthrough();

export const ModelsDevResponseSchema = z.record(z.string(), ModelsDevProviderSchema);

export type ModelsDevModel = z.infer<typeof ModelsDevModelSchema>;
export type ModelsDevProvider = z.infer<typeof ModelsDevProviderSchema>;
export type ModelsDevResponse = z.infer<typeof ModelsDevResponseSchema>;
