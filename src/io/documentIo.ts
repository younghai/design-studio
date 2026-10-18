import type { Document, StudioNode } from "../model/types";

export const STORAGE_KEY = "design-studio-doc-v1";

export type SpecValidation =
  | { ok: true; spec: Record<string, unknown> }
  | { ok: false; errors: string[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function validateSpec(input: unknown): SpecValidation {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: ["루트가 JSON 객체가 아닙니다"] };
  }
  if (input.name !== undefined && typeof input.name !== "string") {
    errors.push("name은 문자열이어야 합니다");
  }
  if (input.width !== undefined && typeof input.width !== "number") {
    errors.push("width는 숫자여야 합니다");
  }
  if (input.height !== undefined && typeof input.height !== "number") {
    errors.push("height는 숫자여야 합니다");
  }
  if (input.layout !== undefined) {
    if (
      !isRecord(input.layout) ||
      (input.layout.dir !== undefined && input.layout.dir !== "row" && input.layout.dir !== "column")
    ) {
      errors.push("layout.dir은 row 또는 column이어야 합니다");
    }
  }
  if (input.children !== undefined) {
    if (!Array.isArray(input.children)) {
      errors.push("children는 배열이어야 합니다");
    } else {
      input.children.forEach((c, i) => {
        const child = validateSpec(c);
        if (!child.ok) errors.push(`children[${i}]: ${child.errors.join(", ")}`);
      });
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, spec: input };
}

export function validateDocument(input: unknown): { ok: true; doc: Document } | { ok: false; errors: string[] } {
  if (!isRecord(input)) return { ok: false, errors: ["루트가 JSON 객체가 아닙니다"] };
  if (input.schemaVersion !== 1) {
    return { ok: false, errors: [`schemaVersion이 지원되지 않습니다: ${String(input.schemaVersion)}`] };
  }
  if (!isRecord(input.root)) return { ok: false, errors: ["root가 없습니다"] };
  if (!Array.isArray(input.collections)) return { ok: false, errors: ["collections가 배열이 아닙니다"] };
  if (input.mode !== "light" && input.mode !== "dark") {
    return { ok: false, errors: ["mode는 light 또는 dark이어야 합니다"] };
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
    const out: Record<string, unknown> = {
      name: n.name,
      kind: n.kind,
      width: n.width,
      height: n.height,
      ...(n.style.fill !== undefined ? { fill: n.style.fill } : {}),
      ...(n.style.stroke !== undefined ? { stroke: n.style.stroke } : {}),
      ...(n.style.strokeWidth !== undefined ? { stroke_width: n.style.strokeWidth } : {}),
      ...(n.style.radius !== undefined ? { radius: n.style.radius } : {}),
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
  return nodeToSpec(doc.root);
}
