import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { zodToJsonSchema } from "../zod-to-json-schema.js";

test("converts a flat object schema with required and optional fields", () => {
  const schema = z.object({
    path: z.string(),
    recursive: z.boolean().optional(),
    maxDepth: z.number().optional(),
  });

  const json = zodToJsonSchema(schema);

  assert.equal(json.type, "object");
  assert.deepEqual((json.properties as any).path, { type: "string" });
  assert.deepEqual((json.required as string[]).sort(), ["path"]);
});

test("converts enums to string with enum values", () => {
  const schema = z.object({ mode: z.enum(["plan", "build"]) });
  const json = zodToJsonSchema(schema);
  assert.deepEqual((json.properties as any).mode, { type: "string", enum: ["plan", "build"] });
});

test("converts arrays", () => {
  const schema = z.object({ files: z.array(z.string()) });
  const json = zodToJsonSchema(schema);
  assert.deepEqual((json.properties as any).files, { type: "array", items: { type: "string" } });
});

test("nested objects work recursively", () => {
  const schema = z.object({
    edit: z.object({
      oldStr: z.string(),
      newStr: z.string(),
    }),
  });
  const json = zodToJsonSchema(schema);
  const edit = (json.properties as any).edit;
  assert.equal(edit.type, "object");
  assert.deepEqual(edit.required.sort(), ["newStr", "oldStr"]);
});

test("realistic tool schema resembling our edit-file tool", () => {
  const schema = z.object({
    path: z.string(),
    oldStr: z.string(),
    newStr: z.string().default(""),
  });
  const json = zodToJsonSchema(schema);
  assert.deepEqual((json.required as string[]).sort(), ["oldStr", "path"]);
});
