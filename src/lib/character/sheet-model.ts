import type {
  AttributeField, DerivedField, DerivedValues, ResourceField, SheetRule,
} from "@/lib/rules/sheet-schema";
import type { CustomAttribute } from "./types";
import {
  CUSTOM_ATTRIBUTE_LIMITS, PROFILE_AGE_RANGE, PROFILE_LEVEL_RANGE, PROFILE_TEXT_LIMITS,
  type CharacterSheetV2, type ProfileEdit, type ResourceValue, type SheetEdit,
} from "./sheet-v2";

/**
 * Generic sheet model: read a v2 sheet through its rule's schema
 * (`resolveSheet`) and change it (`applySheetEdit`). Every rule, every writer
 * and every surface goes through these two functions, so clamping, derivation
 * and "is it set" have exactly one implementation.
 *
 * Pure and client-safe — the panel previews an edit with the same function
 * the server persists it with.
 */

export interface ResolvedAttribute {
  field: AttributeField;
  /** Stored value, or the field default while unset. */
  value: number;
  isSet: boolean;
}

export interface ResolvedResource {
  field: ResourceField;
  current: number;
  /** Upper bound; undefined for unbounded counters. */
  max?: number;
  min: number;
  currentSet: boolean;
  maxSet: boolean;
  /** Completion meaning of "set" — the max for editable-max resources. */
  isSet: boolean;
}

export interface ResolvedDerived {
  field: DerivedField;
  value: number | string;
}

export interface ResolvedSheet {
  sheet: CharacterSheetV2;
  /** Every schema attribute, defaults filled in — the input to `derive`. */
  attributeValues: Record<string, number>;
  /** Schema order. */
  attributes: ResolvedAttribute[];
  resources: ResolvedResource[];
  /** Everything `derive` returned, hidden values included. */
  derived: DerivedValues;
  /** Declared derived fields, schema order. */
  derivedFields: ResolvedDerived[];
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/** Round an untrusted value; null when it isn't a finite number. */
function toInt(v: unknown): number | null {
  if (typeof v !== "number" && typeof v !== "string") return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** A derived value read as a number (text values and garbage read as 0). */
export function derivedNumber(derived: DerivedValues, key: string): number {
  const n = Number(derived[key]);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * Attribute values with defaults filled in. A stored value is used as-is even
 * when outside the field's range — values are clamped when written, never
 * silently rewritten on read.
 */
export function attributeValues(rule: SheetRule, sheet: CharacterSheetV2): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of rule.sheet.attributes) {
    const stored = sheet.attributes?.[f.key];
    out[f.key] = isFiniteNumber(stored) ? stored : f.default;
  }
  return out;
}

/** A resource's legal range given the current derived values. */
export function resourceBounds(
  field: ResourceField,
  stored: ResourceValue | undefined,
  derived: DerivedValues,
): { min: number; max?: number } {
  const min = field.min ?? 0;
  if (!field.max) return { min };
  if ("derived" in field.max) return { min, max: derivedNumber(derived, field.max.derived) };
  const storedMax = stored?.max;
  if (isFiniteNumber(storedMax)) return { min, max: storedMax };
  const fallback = field.max.editable.default;
  return fallback === undefined ? { min } : { min, max: fallback };
}

/**
 * The highest value a resource current may hold: its max, else its cap.
 *
 * Unlike attributes, resource currents are also bounded on read: a player's
 * chosen attribute is kept even when out of range, but a current above its
 * (possibly derived) max is never a meaningful state — it only arises when an
 * attribute change lowered the max — so reads show it bounded and the next
 * write (`normalizeSheet`) persists the bound.
 */
function upperBound(field: ResourceField, max: number | undefined): number {
  if (max !== undefined) return max;
  return field.cap ?? Number.POSITIVE_INFINITY;
}

function initialCurrent(field: ResourceField, bounds: { min: number; max?: number }, derived: DerivedValues): number {
  const init = field.initial;
  if (init === "max") return bounds.max ?? bounds.min;
  if (typeof init === "number") return init;
  return derivedNumber(derived, init.derived);
}

function resolveResource(field: ResourceField, stored: ResourceValue | undefined, derived: DerivedValues): ResolvedResource {
  const bounds = resourceBounds(field, stored, derived);
  const currentSet = isFiniteNumber(stored?.current);
  const maxSet = isFiniteNumber(stored?.max);
  const raw = currentSet ? (stored!.current as number) : initialCurrent(field, bounds, derived);
  const current = clamp(raw, bounds.min, upperBound(field, bounds.max));
  const editableMax = !!field.max && "editable" in field.max;
  return {
    field,
    current,
    max: bounds.max,
    min: bounds.min,
    currentSet,
    maxSet,
    isSet: editableMax ? maxSet : currentSet,
  };
}

/** Read a sheet through its rule: defaults, derived values, resource bounds. */
export function resolveSheet(rule: SheetRule, sheet: CharacterSheetV2): ResolvedSheet {
  const values = attributeValues(rule, sheet);
  const derived = rule.derive(values);
  return {
    sheet,
    attributeValues: values,
    attributes: rule.sheet.attributes.map((field) => ({
      field,
      value: values[field.key],
      isSet: isFiniteNumber(sheet.attributes?.[field.key]),
    })),
    resources: rule.sheet.resources.map((field) =>
      resolveResource(field, sheet.resources?.[field.key], derived)),
    derived,
    derivedFields: rule.sheet.derived.map((field) => ({
      field,
      value: field.format === "text" ? String(derived[field.key] ?? "") : derivedNumber(derived, field.key),
    })),
  };
}

export function findResource(resolved: ResolvedSheet, key: string): ResolvedResource | undefined {
  return resolved.resources.find((r) => r.field.key === key);
}

export function findAttribute(resolved: ResolvedSheet, key: string): ResolvedAttribute | undefined {
  return resolved.attributes.find((a) => a.field.key === key);
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function sanitizeText(v: unknown, limit: number, trim: boolean): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = (trim ? v.trim() : v).slice(0, limit);
  return s.length > 0 ? s : undefined;
}

function applyProfile(out: CharacterSheetV2, edit: ProfileEdit): void {
  const text = (key: keyof typeof PROFILE_TEXT_LIMITS, trim: boolean) => {
    if (!(key in edit)) return;
    const v = edit[key];
    const s = v === null ? undefined : sanitizeText(v, PROFILE_TEXT_LIMITS[key], trim);
    if (s === undefined) delete out[key];
    else out[key] = s;
  };
  text("name", true);
  text("occupation", true);
  text("bio", false);
  text("role", true);

  const num = (key: "age" | "level", range: { min: number; max: number }) => {
    if (!(key in edit)) return;
    const v = edit[key];
    if (v === null) { delete out[key]; return; }
    const n = toInt(v);
    if (n !== null) out[key] = clamp(n, range.min, range.max);
  };
  num("age", PROFILE_AGE_RANGE);
  num("level", PROFILE_LEVEL_RANGE);
}

/** Whitelist and bound a player-supplied custom attribute list. */
export function sanitizeCustomAttributes(list: unknown): CustomAttribute[] {
  if (!Array.isArray(list)) return [];
  const out: CustomAttribute[] = [];
  const seen = new Set<string>();
  const lim = CUSTOM_ATTRIBUTE_LIMITS.valueAbs;
  for (const item of list) {
    if (out.length >= CUSTOM_ATTRIBUTE_LIMITS.count) break;
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const name = sanitizeText(rec.name, CUSTOM_ATTRIBUTE_LIMITS.nameLength, true);
    const value = toInt(rec.value);
    if (!name || value === null || seen.has(name)) continue;
    seen.add(name);
    const attr: CustomAttribute = { name, value: clamp(value, -lim, lim) };
    const max = toInt(rec.max);
    if (max !== null) attr.max = clamp(max, -lim, lim);
    out.push(attr);
  }
  return out;
}

/**
 * Bring a sheet in line with its schema: drop keys the schema doesn't
 * declare (derived keys included) and clamp stored resource currents into
 * their bounds — an attribute change can lower a derived max. Stored
 * attributes are left alone (see `attributeValues`).
 */
export function normalizeSheet(rule: SheetRule, sheet: CharacterSheetV2): CharacterSheetV2 {
  const attributes: Record<string, number> = {};
  for (const f of rule.sheet.attributes) {
    const v = sheet.attributes?.[f.key];
    if (isFiniteNumber(v)) attributes[f.key] = v;
  }
  const derived = rule.derive(attributeValues(rule, { ...sheet, attributes }));
  const resources: Record<string, ResourceValue> = {};
  for (const f of rule.sheet.resources) {
    const stored = sheet.resources?.[f.key];
    if (!stored) continue;
    const kept: ResourceValue = {};
    const editableMax = !!f.max && "editable" in f.max;
    if (editableMax && isFiniteNumber(stored.max)) kept.max = stored.max;
    if (isFiniteNumber(stored.current)) {
      const b = resourceBounds(f, kept, derived);
      kept.current = clamp(stored.current, b.min, upperBound(f, b.max));
    }
    if (kept.current !== undefined || kept.max !== undefined) resources[f.key] = kept;
  }
  const out: CharacterSheetV2 = { ...sheet, schemaVersion: 2, attributes, resources };
  // Stored lists predate validation (legacy rows, old AI writes).
  if (sheet.customAttributes !== undefined) {
    const list = sanitizeCustomAttributes(sheet.customAttributes);
    if (list.length > 0) out.customAttributes = list;
    else delete out.customAttributes;
  }
  if (!rule.sheet.profile.roleLevel) {
    delete out.role;
    delete out.level;
  }
  return out;
}

/**
 * Apply an edit to a sheet — the single write path. Unknown keys and derived
 * keys are ignored, numbers are rounded and clamped to the schema, `null`
 * clears a value back to unset. Returns the new sheet and the paths that
 * actually changed (see `sheetDiff`).
 */
export function applySheetEdit(
  rule: SheetRule,
  sheet: CharacterSheetV2,
  edit: SheetEdit,
): { sheet: CharacterSheetV2; changed: string[] } {
  const next: CharacterSheetV2 = {
    ...sheet,
    attributes: { ...(sheet.attributes ?? {}) },
    resources: Object.fromEntries(
      Object.entries(sheet.resources ?? {}).map(([k, v]) => [k, { ...v }]),
    ),
  };

  const attrFields = new Map(rule.sheet.attributes.map((f) => [f.key, f]));
  for (const [key, v] of Object.entries(edit.attributes ?? {})) {
    const f = attrFields.get(key);
    if (!f) continue;
    if (v === null) { delete next.attributes[key]; continue; }
    const n = toInt(v);
    if (n !== null) next.attributes[key] = clamp(n, f.min, f.max);
  }

  const resFields = new Map(rule.sheet.resources.map((f) => [f.key, f]));
  for (const [key, patch] of Object.entries(edit.resources ?? {})) {
    const f = resFields.get(key);
    if (!f || !patch || typeof patch !== "object") continue;
    const value: ResourceValue = { ...(next.resources[key] ?? {}) };
    if (patch.max !== undefined && f.max && "editable" in f.max) {
      if (patch.max === null) delete value.max;
      else {
        const n = toInt(patch.max);
        if (n !== null) value.max = clamp(n, f.max.editable.min, f.max.editable.max);
      }
    }
    if (patch.current !== undefined) {
      if (patch.current === null) delete value.current;
      else {
        const n = toInt(patch.current);
        if (n !== null) value.current = n; // bounded by normalizeSheet
      }
    }
    if (value.current === undefined && value.max === undefined) delete next.resources[key];
    else next.resources[key] = value;
  }

  if (edit.profile) applyProfile(next, edit.profile);
  if (Array.isArray(edit.customAttributes)) {
    const list = sanitizeCustomAttributes(edit.customAttributes);
    if (list.length > 0) next.customAttributes = list;
    else delete next.customAttributes;
  }

  const normalized = normalizeSheet(rule, next);
  return { sheet: normalized, changed: sheetDiff(sheet, normalized) };
}

/**
 * Shape-check an untrusted edit at an action boundary: each group must be the
 * right kind of container, or the whole edit is rejected (null) rather than
 * half-applied. Values are validated by `applySheetEdit`.
 */
export function sanitizeSheetEdit(input: unknown): SheetEdit | null {
  const rec = (v: unknown): Record<string, unknown> | undefined =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
  const r = rec(input);
  if (!r) return null;
  const out: SheetEdit = {};
  if (r.attributes !== undefined) {
    const a = rec(r.attributes);
    if (!a) return null;
    out.attributes = a as SheetEdit["attributes"];
  }
  if (r.resources !== undefined) {
    const res = rec(r.resources);
    if (!res) return null;
    out.resources = {};
    for (const [k, v] of Object.entries(res)) {
      const one = rec(v);
      if (!one) return null;
      out.resources[k] = { current: one.current as number | null | undefined, max: one.max as number | null | undefined };
    }
  }
  if (r.profile !== undefined) {
    const p = rec(r.profile);
    if (!p) return null;
    out.profile = p as SheetEdit["profile"];
  }
  if (r.customAttributes !== undefined) {
    if (!Array.isArray(r.customAttributes)) return null;
    out.customAttributes = r.customAttributes as SheetEdit["customAttributes"];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

const PROFILE_KEYS = ["name", "age", "occupation", "bio", "avatarUrl", "role", "level"] as const;

/**
 * Paths whose stored value differs between two sheets:
 * `attributes.<key>`, `resources.<key>.current|max`, `profile.<key>`,
 * `customAttributes`. Sorted.
 */
export function sheetDiff(a: CharacterSheetV2, b: CharacterSheetV2): string[] {
  const out = new Set<string>();
  const attrKeys = new Set([...Object.keys(a.attributes ?? {}), ...Object.keys(b.attributes ?? {})]);
  for (const k of attrKeys) {
    if (a.attributes?.[k] !== b.attributes?.[k]) out.add(`attributes.${k}`);
  }
  const resKeys = new Set([...Object.keys(a.resources ?? {}), ...Object.keys(b.resources ?? {})]);
  for (const k of resKeys) {
    if (a.resources?.[k]?.current !== b.resources?.[k]?.current) out.add(`resources.${k}.current`);
    if (a.resources?.[k]?.max !== b.resources?.[k]?.max) out.add(`resources.${k}.max`);
  }
  for (const k of PROFILE_KEYS) {
    if (a[k] !== b[k]) out.add(`profile.${k}`);
  }
  if (JSON.stringify(a.customAttributes ?? []) !== JSON.stringify(b.customAttributes ?? [])) {
    out.add("customAttributes");
  }
  return [...out].sort();
}

// ---------------------------------------------------------------------------
// Stats by route (`.st` / `.rc` / quick-check panel)
// ---------------------------------------------------------------------------

/** A stat reached by name: an attribute, or a resource's current value. */
export interface StatRef {
  kind: "attribute" | "resource";
  key: string;
}

/** The value a stat reads as (unset attributes read as their default). */
export function statValue(rule: SheetRule, sheet: CharacterSheetV2, ref: StatRef): number | undefined {
  const r = resolveSheet(rule, sheet);
  if (ref.kind === "attribute") return findAttribute(r, ref.key)?.value;
  return findResource(r, ref.key)?.current;
}

/** The edit that sets a stat — what `.st <name> <value>` writes. */
export function statEdit(ref: StatRef, value: number): SheetEdit {
  return ref.kind === "attribute"
    ? { attributes: { [ref.key]: value } }
    : { resources: { [ref.key]: { current: value } } };
}
