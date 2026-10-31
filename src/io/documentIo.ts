import type { Document, StudioNode } from "../model/types";
import { solid } from "../model/types";

export const STORAGE_KEY = "design-studio-doc-v1";

// Guards unbounded recursion (stack overflow) from adversarial or corrupted
// nested input at the parse boundary.
export const MAX_NODE_DEPTH = 64;

export type SpecValidation =
  | { ok: true; spec: Record<string, unknown> }
  | { ok: false; errors: string[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const NODE_KINDS = ["frame", "text", "rect", "ellipse"];

function validateNode(input: unknown, depth: number, errors: string[]): void {
  if (depth > MAX_NODE_DEPTH) {
    errors.push(`중첩 깊이가 ${MAX_NODE_DEPTH}을 초과합니다`);
    return;
  }
  if (!isRecord(input)) {
    errors.push("노드가 JSON 객체가 아닙니다");
    return;
  }
  if (input.kind !== undefined && !NODE_KINDS.includes(String(input.kind))) {
    errors.push(`kind는 ${NODE_KINDS.join("|")} 중 하나여야 합니다`);
  }
  for (const field of ["x", "y", "width", "height", "radius", "font_size", "font_weight"] as const) {
    if (input[field] !== undefined && typeof input[field] !== "number") {
      errors.push(`${field}는 숫자여야 합니다`);
    }
  }
  if (input.children !== undefined) {
    if (!Array.isArray(input.children)) {
      errors.push("children는 배열이어야 합니다");
    } else {
      input.children.forEach((c, i) => {
        const before = errors.length;
        validateNode(c, depth + 1, errors);
        if (errors.length > before) errors.splice(before, 0, `children[${i}]:`);
      });
    }
  }
}

export function validateSpec(input: unknown): SpecValidation {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: ["루트가 JSON 객체가 아닙니다"] };
  }
  if (input.name !== undefined && typeof input.name !== "string") {
    errors.push("name은 문자열이어야 합니다");
  }
  validateNode(input, 0, errors);
  if (input.layout !== undefined) {
    if (
      !isRecord(input.layout) ||
      (input.layout.dir !== undefined && input.layout.dir !== "row" && input.layout.dir !== "column")
    ) {
      errors.push("layout.dir은 row 또는 column이어야 합니다");
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, spec: input };
}

/** v1 node (style.fill string) → v2 node (fills[], effects[], devStatus). */
function migrateNode(node: StudioNode): StudioNode {
  const legacyFill = (node.style as { fill?: string }).fill;
  return {
    ...node,
    devStatus: node.devStatus ?? "design",
    style: {
      ...node.style,
      fills: node.style.fills ?? (legacyFill !== undefined ? [solid(legacyFill)] : []),
      effects: node.style.effects ?? [],
    },
    children: node.children.map(migrateNode),
  };
}

export function migrateV1Document(input: {
  name?: unknown;
  mode?: unknown;
  collections?: unknown;
  root?: unknown;
}): Document {
  const root = migrateNode((input.root as StudioNode) ?? { id: "root", name: "Screen", kind: "frame", x: 0, y: 0, width: 0, height: 0, sizingW: "fixed", sizingH: "fixed", visible: true, style: { fills: [], effects: [] }, children: [] });
  root.x = 0;
  root.y = 0;
  return {
    schemaVersion: 2,
    name: typeof input.name === "string" ? input.name : "Untitled",
    mode: input.mode === "light" ? "light" : "dark",
    collections: Array.isArray(input.collections) ? (input.collections as Document["collections"]) : [],
    pages: [root],
  };
}

export function validateDocument(input: unknown): { ok: true; doc: Document } | { ok: false; errors: string[] } {
  if (!isRecord(input)) return { ok: false, errors: ["루트가 JSON 객체가 아닙니다"] };

  if (input.schemaVersion === 1) {
    // Validate the v1 root BEFORE migrating; a corrupted v1 doc must be
    // discarded, not half-migrated.
    if (!isRecord(input.root)) return { ok: false, errors: ["v1 문서에 root가 없습니다"] };
    const nodeErrors: string[] = [];
    validateNode(input.root, 0, nodeErrors);
    if (nodeErrors.length > 0) {
      return { ok: false, errors: [`root가 손상되었습니다: ${nodeErrors.slice(0, 3).join(", ")}`] };
    }
    return { ok: true, doc: migrateV1Document(input as Parameters<typeof migrateV1Document>[0]) };
  }

  if (input.schemaVersion !== 2) {
    return { ok: false, errors: [`schemaVersion이 지원되지 않습니다: ${String(input.schemaVersion)}`] };
  }
  if (!Array.isArray(input.pages) || input.pages.length === 0) {
    return { ok: false, errors: ["pages는 1개 이상의 배열이어야 합니다"] };
  }
  if (!Array.isArray(input.collections)) return { ok: false, errors: ["collections가 배열이 아닙니다"] };
  if (input.mode !== "light" && input.mode !== "dark") {
    return { ok: false, errors: ["mode는 light 또는 dark이어야 합니다"] };
  }
  for (const page of input.pages) {
    const nodeErrors: string[] = [];
    validateNode(page, 0, nodeErrors);
    if (nodeErrors.length > 0) {
      return { ok: false, errors: [`page가 손상되었습니다: ${nodeErrors.slice(0, 3).join(", ")}`] };
    }
  }
  return { ok: true, doc: input as unknown as Document };
}

export function exportDocument(doc: Document): void {
  const text = JSON.stringify(doc, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${doc.name.replace(/\s+/g, "-").toLowerCase() || "document"}.design.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importDocumentFile(file: File): Promise<Document> {
  const text = await file.text();
  const parsed: unknown = JSON.parse(text);
  const result = validateDocument(parsed);
  if (!result.ok) throw new Error(result.errors.join(", "));
  return result.doc;
}

export async function readSpecFile(file: File): Promise<Record<string, unknown>> {
  const text = await file.text();
  const parsed: unknown = JSON.parse(text);
  const result = validateSpec(parsed);
  if (!result.ok) throw new Error(result.errors.join(", "));
  return result.spec;
}

export function saveLocal(doc: Document): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    // quota exceeded — autosave is best-effort
  }
}

export function loadLocal(): Document | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const result = validateDocument(parsed);
    if (!result.ok) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return result.doc;
  } catch {
    return null;
  }
}

export function specFromDocument(doc: Document): Record<string, unknown> {
  function nodeToSpec(n: StudioNode): Record<string, unknown> {
    const firstSolid = n.style.fills.find((p) => p.type === "solid");
    const out: Record<string, unknown> = {
      name: n.name,
      kind: n.kind,
      width: n.width,
      height: n.height,
      ...(firstSolid ? { fill: firstSolid.color } : {}),
      ...(n.style.stroke !== undefined ? { stroke: n.style.stroke } : {}),
      ...(n.style.strokeWidth !== undefined ? { stroke_width: n.style.strokeWidth } : {}),
      ...(n.style.radius !== undefined ? { radius: n.style.radius } : {}),
      ...(n.devStatus !== "design" ? { dev_status: n.devStatus } : {}),
      ...(n.text
        ? { text: n.text.text, font_size: n.text.fontSize, font_weight: n.text.fontWeight, ...(n.text.color ? { color: n.text.color } : {}) }
        : {}),
      ...(n.layout
        ? { layout: { dir: n.layout.dir, gap: n.layout.gap, padding: n.layout.padding, align: n.layout.align, justify: n.layout.justify } }
        : {}),
      ...(n.children.length > 0 ? { children: n.children.map(nodeToSpec) } : {}),
    };
    return out;
  }
  return nodeToSpec(doc.pages[0]);
}
