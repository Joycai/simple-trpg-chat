import type { SheetRule } from "@/lib/rules/sheet-schema";
import type { SheetEdit } from "./sheet-v2";

/**
 * The AI bot's `set_character_card` tool, derived from the room rule's
 * schema: the JSON-schema fragment advertised to the model and the mapping
 * from its (untrusted) arguments to a `SheetEdit`. Declaring a field and
 * accepting it come from the same schema, so they can't drift apart —
 * `applySheetEdit` still whitelists and clamps whatever the model sends.
 */

export function sheetToolSchema(rule: SheetRule): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const { attributes, resources, profile } = rule.sheet;

  if (attributes.length > 0) {
    props.attributes = {
      type: "object",
      description: `Character attributes for this room's rule (${rule.id}). Each is an integer in its range; unset ones read as the default.`,
      properties: Object.fromEntries(attributes.map((f) => [f.key, {
        type: "integer",
        minimum: f.min,
        maximum: f.max,
        description: `${f.key}: ${f.min}–${f.max}, default ${f.default}${f.required ? ", required" : ""}`,
      }])),
    };
  }

  if (resources.length > 0) {
    props.resources = {
      type: "object",
      description: "Current state values (hit points, sanity, counters…). Maxes derived from attributes are computed, not set.",
      properties: Object.fromEntries(resources.map((f) => {
        const editableMax = !!f.max && "editable" in f.max;
        const fields: Record<string, unknown> = { current: { type: "integer", description: `Current ${f.key}` } };
        if (editableMax) fields.max = { type: "integer", description: `Maximum ${f.key}` };
        return [f.key, { type: "object", properties: fields }];
      })),
    };
  }

  if (profile.roleLevel) {
    props.role = { type: "string", description: "Class / role" };
    props.level = { type: "integer", description: "Level" };
  }
  return props;
}

type ToolArgs = Record<string, unknown>;

function record(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** Map `set_character_card` arguments to a sheet edit (validated downstream). */
export function editFromToolArgs(args: ToolArgs): SheetEdit {
  const edit: SheetEdit = {};

  const attrs = record(args.attributes);
  if (attrs) edit.attributes = attrs as Record<string, number>;

  const res = record(args.resources);
  if (res) {
    edit.resources = {};
    for (const [key, v] of Object.entries(res)) {
      const r = record(v);
      if (r) edit.resources[key] = { current: r.current as number | undefined, max: r.max as number | undefined };
    }
  }

  const profile: NonNullable<SheetEdit["profile"]> = {};
  for (const key of ["name", "occupation", "bio", "role"] as const) {
    if (typeof args[key] === "string") profile[key] = args[key] as string;
  }
  for (const key of ["age", "level"] as const) {
    if (args[key] !== undefined) profile[key] = args[key] as number;
  }
  if (Object.keys(profile).length > 0) edit.profile = profile;

  if (Array.isArray(args.customAttributes)) edit.customAttributes = args.customAttributes as SheetEdit["customAttributes"];
  return edit;
}
