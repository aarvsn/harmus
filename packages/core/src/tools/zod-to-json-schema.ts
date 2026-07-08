import { z } from "zod";

/**
 * Converts a Zod schema to JSON Schema, for the subset of Zod types we
 * actually use in tool definitions (object, string, number, boolean,
 * enum, array, optional, default, nullable). This intentionally does not
 * try to support the entire Zod surface - if a tool needs a shape this
 * doesn't handle, extend it here rather than reaching for a heavyweight dep.
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return convert(schema);
}

function convert(schema: z.ZodType): Record<string, unknown> {
  const def = (schema as any)._def;

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      const fieldSchema = value as z.ZodType;
      properties[key] = convert(fieldSchema);
      if (!isOptional(fieldSchema)) {
        required.push(key);
      }
    }
    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: "string" };
    if (def.description) result.description = def.description;
    return result;
  }

  if (schema instanceof z.ZodNumber) {
    return { type: "number" };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }

  if (schema instanceof z.ZodEnum) {
    return { type: "string", enum: def.values };
  }

  if (schema instanceof z.ZodArray) {
    return { type: "array", items: convert(def.type) };
  }

  if (schema instanceof z.ZodOptional) {
    return convert(def.innerType);
  }

  if (schema instanceof z.ZodNullable) {
    return convert(def.innerType);
  }

  if (schema instanceof z.ZodDefault) {
    return convert(def.innerType);
  }

  if (schema instanceof z.ZodLiteral) {
    return { const: def.value };
  }

  if (schema instanceof z.ZodUnion) {
    return { anyOf: def.options.map((opt: z.ZodType) => convert(opt)) };
  }

  // Fallback: accept anything for unsupported types rather than throwing,
  // since an overly strict schema is worse than a permissive one here.
  return {};
}

function isOptional(schema: z.ZodType): boolean {
  return schema instanceof z.ZodOptional || schema instanceof z.ZodDefault;
}

/** Attach a description to the top-level schema in its JSON Schema output, if not already present. */
export function withDescription(
  jsonSchema: Record<string, unknown>,
  description: string,
): Record<string, unknown> {
  if (jsonSchema.description) return jsonSchema;
  return { ...jsonSchema, description };
}
