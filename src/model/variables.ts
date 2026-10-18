import type { Document, Mode, VariableCollection } from "./types";

export function isAlias(value: string | undefined): boolean {
  return typeof value === "string" && value.startsWith("$");
}

function splitAlias(alias: string): { collection: string; path: string } {
  const withoutPrefix = alias.slice(1);
  const dot = withoutPrefix.indexOf(".");
  if (dot < 0) {
    return { collection: withoutPrefix, path: "" };
  }
  return { collection: withoutPrefix.slice(0, dot), path: withoutPrefix.slice(dot + 1) };
}

function findCollection(doc: Document, name: string): VariableCollection | undefined {
  return doc.collections.find((c) => c.name === name);
}

function lookupRaw(collection: VariableCollection, path: string, mode: Mode): string | undefined {
  const entry = collection.variables[path];
  if (!entry) return undefined;
  return mode === "light" ? entry.light : entry.dark;
}

export function resolveColor(
  value: string | undefined,
  doc: Document,
  mode: Mode = doc.mode
): string | undefined {
  if (value === undefined) return undefined;
  if (!isAlias(value)) return value;

  let current = value;
  for (let depth = 0; depth < 8; depth += 1) {
    if (!isAlias(current)) return current;
    const { collection, path } = splitAlias(current);
    const coll = findCollection(doc, collection);
    const next = coll ? lookupRaw(coll, path, mode) : undefined;
    if (next === undefined) return current;
    if (next === value) return next;
    current = next;
  }
  return current;
}
