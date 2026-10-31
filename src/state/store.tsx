import React, { createContext, useContext, useMemo, useReducer } from "react";
import type {
  DevStatus,
  Document,
  LayoutSpec,
  Mode,
  StudioNode,
  StyleProps,
  TextProps,
} from "../model/types";
import { makeInitialDocument } from "../model/fixtures";

export type Tool = "select" | "frame" | "text" | "rect" | "ellipse";

export interface NodePatch {
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  sizingW?: StudioNode["sizingW"];
  sizingH?: StudioNode["sizingH"];
  visible?: boolean;
  devStatus?: DevStatus;
  style?: Partial<StyleProps>;
  text?: Partial<TextProps>;
  layout?: Partial<LayoutSpec>;
}

export type Action =
  | { type: "select"; id: string | null }
  | { type: "select-toggle"; id: string }
  | { type: "select-many"; ids: string[] }
  | { type: "move"; id: string; dx: number; dy: number }
  | { type: "move-set"; ids: string[]; dx: number; dy: number }
  | { type: "resize"; id: string; width: number; height: number }
  | { type: "set-props"; id: string; patch: NodePatch }
  | { type: "set-status"; ids: string[]; status: DevStatus }
  | { type: "align"; ids: string[]; mode: "left" | "center" | "right" | "top" | "middle" | "bottom" | "h" | "v"; rects: Record<string, { x: number; y: number; w: number; h: number }> }
  | { type: "reorder"; id: string; parentId: string | null; index: number }
  | { type: "create"; node: StudioNode; parentId: string }
  | { type: "add-page" }
  | { type: "delete-page"; pageIndex: number }
  | { type: "delete"; id: string }
  | { type: "delete-set"; ids: string[] }
  | { type: "duplicate"; id: string }
  | { type: "duplicate-set"; ids: string[] }
  | { type: "set-mode"; mode: Mode }
  | { type: "set-variable"; collection: string; path: string; mode: Mode; value: string }
  | { type: "set-tool"; tool: Tool }
  | { type: "set-devmode"; on: boolean }
  | { type: "set-viewport"; zoom?: number; panX?: number; panY?: number }
  | { type: "toast"; message: string | null }
  | { type: "copy" }
  | { type: "paste" }
  | { type: "load-document"; doc: Document }
  | { type: "restore"; doc: Document }
  | { type: "undo" }
  | { type: "redo" };

export interface AppState {
  doc: Document;
  selectedIds: string[];
  primaryId: string | null;
  tool: Tool;
  devMode: boolean;
  zoom: number;
  panX: number;
  panY: number;
  toast: string | null;
  clipboard: StudioNode[];
  undoStack: Document[];
  redoStack: Document[];
  /** Coalescing window: rapid same-node edits share ONE undo entry. */
  lastEdit: { type: string; id: string; at: number } | null;
}

export const UNDO_LIMIT = 50;

export interface NodeHit {
  node: StudioNode;
  parent: StudioNode | null;
  pageIndex: number;
  index: number;
}

export function findNode(
  root: StudioNode,
  id: string
): { node: StudioNode; parent: StudioNode | null; index: number } | null {
  // The match must thread its actual parent up the recursion; returning
  // parent:null at each level silently broke duplicate/reorder/copy.
  function walk(node: StudioNode, parent: StudioNode | null): { node: StudioNode; parent: StudioNode | null; index: number } | null {
    if (node.id === id) {
      return { node, parent, index: parent ? parent.children.indexOf(node) : 0 };
    }
    for (const child of node.children) {
      const hit = walk(child, node);
      if (hit) return hit;
    }
    return null;
  }
  return walk(root, null);
}

export function findInDoc(doc: Document, id: string): NodeHit | null {
  for (let p = 0; p < doc.pages.length; p += 1) {
    const hit = findNode(doc.pages[p], id);
    if (hit) return { ...hit, pageIndex: p };
  }
  return null;
}

/** Page of the primary selection, else the first page. */
export function activePageIndex(doc: Document, selectedIds: string[]): number {
  for (const id of [...selectedIds].reverse()) {
    const hit = findInDoc(doc, id);
    if (hit) return hit.pageIndex;
  }
  return 0;
}

export function mapTree(node: StudioNode, id: string, fn: (n: StudioNode) => StudioNode): StudioNode {
  if (node.id === id) return fn(node);
  return { ...node, children: node.children.map((c) => mapTree(c, id, fn)) };
}

function mapPage(doc: Document, pageIndex: number, fn: (root: StudioNode) => StudioNode): Document {
  const pages = [...doc.pages];
  pages[pageIndex] = fn(pages[pageIndex]);
  return { ...doc, pages };
}

function reId(node: StudioNode): StudioNode {
  return {
    ...node,
    id: `${node.id}-${Math.random().toString(36).slice(2, 8)}`,
    children: node.children.map(reId),
  };
}

function deepClone(node: StudioNode): StudioNode {
  return {
    ...node,
    style: { ...node.style, fills: node.style.fills.map((f) => ({ ...f })), effects: node.style.effects.map((e) => ({ ...e })) },
    text: node.text ? { ...node.text } : undefined,
    layout: node.layout ? { ...node.layout, padding: [...node.layout.padding] as [number, number, number, number] } : undefined,
    children: node.children.map(deepClone),
  };
}

function applyPatch(n: StudioNode, patch: NodePatch): StudioNode {
  return {
    ...n,
    ...("name" in patch ? { name: patch.name ?? n.name } : {}),
    ...(patch.x !== undefined ? { x: patch.x } : {}),
    ...(patch.y !== undefined ? { y: patch.y } : {}),
    ...(patch.width !== undefined ? { width: patch.width } : {}),
    ...(patch.height !== undefined ? { height: patch.height } : {}),
    ...(patch.sizingW !== undefined ? { sizingW: patch.sizingW } : {}),
    ...(patch.sizingH !== undefined ? { sizingH: patch.sizingH } : {}),
    ...(patch.visible !== undefined ? { visible: patch.visible } : {}),
    ...(patch.devStatus !== undefined ? { devStatus: patch.devStatus } : {}),
    style: patch.style ? { ...n.style, ...patch.style } : n.style,
    text: patch.text && n.text ? { ...n.text, ...patch.text } : n.text,
    layout: patch.layout && n.layout ? { ...n.layout, ...patch.layout } : n.layout,
  };
}

function withUndo(state: AppState, nextDoc: Document, edit?: { type: string; id: string }): Partial<AppState> {
  // Continuous edits to the same node (typing, scrubbing) collapse into the
  // undo entry that was open when the burst started.
  const now = Date.now();
  const coalesce =
    edit &&
    state.lastEdit !== null &&
    state.lastEdit.type === edit.type &&
    state.lastEdit.id === edit.id &&
    now - state.lastEdit.at < 600;
  if (coalesce && state.lastEdit) {
    return { doc: nextDoc, lastEdit: { ...state.lastEdit, at: now } };
  }
  const undoStack = [...state.undoStack, state.doc].slice(-UNDO_LIMIT);
  return {
    doc: nextDoc,
    undoStack,
    redoStack: [],
    lastEdit: edit ? { ...edit, at: now } : null,
  };
}

// Free nodes translate; children of an auto-layout parent reorder by the
// dragged position along the parent's main axis (relayout reassigns coords);
// pages are free-floating so they always translate.
function applyMove(doc: Document, id: string, dx: number, dy: number): Document {
  const hit = findInDoc(doc, id);
  if (!hit) return doc;
  if (!hit.parent) {
    const pages = [...doc.pages];
    pages[hit.pageIndex] = { ...hit.node, x: hit.node.x + dx, y: hit.node.y + dy };
    return { ...doc, pages };
  }
  const parent = hit.parent;
  if (parent.layout) {
    const horizontal = parent.layout.dir === "row";
    const pos = horizontal ? hit.node.x + dx : hit.node.y + dy;
    const siblings = parent.children;
    let index = siblings.findIndex((c) => c.id === id);
    const posOf = (c: StudioNode) => (horizontal ? c.x : c.y);
    while (index > 0 && posOf(siblings[index - 1]) > pos) index -= 1;
    while (index < siblings.length - 1 && posOf(siblings[index + 1]) < pos) index += 1;
    const reordered = siblings.filter((c) => c.id !== id);
    reordered.splice(index, 0, hit.node);
    return mapPage(doc, hit.pageIndex, (root) => mapTree(root, parent.id, (n) => ({ ...n, children: reordered })));
  }
  return mapPage(doc, hit.pageIndex, (root) => mapTree(root, id, (n) => ({ ...n, x: n.x + dx, y: n.y + dy })));
}

function removeMany(node: StudioNode, ids: Set<string>): StudioNode {
  return { ...node, children: node.children.filter((c) => !ids.has(c.id)).map((c) => removeMany(c, ids)) };
}

function setNodeXY(doc: Document, id: string, nx: number | null, ny: number | null): Document {
  const hit = findInDoc(doc, id);
  if (!hit) return doc;
  const patchXY = (n: StudioNode): StudioNode => ({
    ...n,
    ...(nx !== null ? { x: nx } : {}),
    ...(ny !== null ? { y: ny } : {}),
  });
  if (!hit.parent) {
    const pages = [...doc.pages];
    pages[hit.pageIndex] = patchXY(hit.node);
    return { ...doc, pages };
  }
  return mapPage(doc, hit.pageIndex, (root) => mapTree(root, id, patchXY));
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "select":
      return { ...state, selectedIds: action.id ? [action.id] : [], primaryId: action.id };
    case "select-toggle": {
      const has = state.selectedIds.includes(action.id);
      const selectedIds = has
        ? state.selectedIds.filter((i) => i !== action.id)
        : [...state.selectedIds, action.id];
      const primaryId = has ? selectedIds[selectedIds.length - 1] ?? null : action.id;
      return { ...state, selectedIds, primaryId };
    }
    case "select-many":
      return { ...state, selectedIds: action.ids, primaryId: action.ids[action.ids.length - 1] ?? null };
    case "set-tool":
      return { ...state, tool: action.tool };
    case "set-devmode":
      return { ...state, devMode: action.on };
    case "set-viewport":
      return {
        ...state,
        zoom: action.zoom ?? state.zoom,
        panX: action.panX ?? state.panX,
        panY: action.panY ?? state.panY,
      };
    case "toast":
      return { ...state, toast: action.message };
    case "set-mode":
      return { ...state, doc: { ...state.doc, mode: action.mode } };
    case "set-variable": {
      const doc = {
        ...state.doc,
        collections: state.doc.collections.map((c) =>
          c.name === action.collection
            ? {
                ...c,
                variables: {
                  ...c.variables,
                  [action.path]: {
                    ...c.variables[action.path],
                    [action.mode]: action.value,
                  },
                },
              }
            : c
        ),
      };
      return { ...state, ...withUndo(state, doc) };
    }
    case "move":
      return { ...state, ...withUndo(state, applyMove(state.doc, action.id, action.dx, action.dy)) };
    case "move-set": {
      let doc = state.doc;
      for (const id of action.ids) {
        doc = applyMove(doc, id, action.dx, action.dy);
      }
      return { ...state, ...withUndo(state, doc) };
    }
    case "resize": {
      const hit = findInDoc(state.doc, action.id);
      if (!hit) return state;
      const doc = mapPage(state.doc, hit.pageIndex, (root) =>
        mapTree(root, action.id, (n) => ({
          ...n,
          width: Math.max(1, action.width),
          height: Math.max(1, action.height),
        }))
      );
      return { ...state, ...withUndo(state, doc) };
    }
    case "set-props": {
      const hit = findInDoc(state.doc, action.id);
      if (!hit) return state;
      const doc = mapPage(state.doc, hit.pageIndex, (root) => mapTree(root, action.id, (n) => applyPatch(n, action.patch)));
      return { ...state, ...withUndo(state, doc, { type: "set-props", id: action.id }) };
    }
    case "set-status": {
      let doc = state.doc;
      for (const id of action.ids) {
        const hit = findInDoc(doc, id);
        if (!hit) continue;
        doc = mapPage(doc, hit.pageIndex, (root) => mapTree(root, id, (n) => ({ ...n, devStatus: action.status })));
      }
      return { ...state, ...withUndo(state, doc) };
    }
    case "align": {
      // rects are the caller's placed (relayouted) geometry; aligning only
      // makes sense for free-positioned nodes, so plain x/y writes are final.
      const list = action.ids.map((id) => ({ id, r: action.rects[id] })).filter((e) => !!e.r);
      if (list.length < 2) return state;
      const left = Math.min(...list.map((e) => e.r.x));
      const right = Math.max(...list.map((e) => e.r.x + e.r.w));
      const top = Math.min(...list.map((e) => e.r.y));
      const bottom = Math.max(...list.map((e) => e.r.y + e.r.h));
      let doc = state.doc;
      for (const { id, r } of list) {
        let nx: number | null = null;
        let ny: number | null = null;
        if (action.mode === "left") nx = left;
        if (action.mode === "right") nx = right - r.w;
        if (action.mode === "center") nx = (left + right) / 2 - r.w / 2;
        if (action.mode === "top") ny = top;
        if (action.mode === "bottom") ny = bottom - r.h;
        if (action.mode === "middle") ny = (top + bottom) / 2 - r.h / 2;
        if (action.mode === "h") {
          const sorted = [...list].sort((a, b) => a.r.x - b.r.x);
          const totalW = sorted.reduce((s, e) => s + e.r.w, 0);
          const gap = (right - left - totalW) / (sorted.length - 1);
          let cursor = left;
          for (const e of sorted) {
            doc = setNodeXY(doc, e.id, Math.round(cursor), null);
            cursor += e.r.w + gap;
          }
          return { ...state, ...withUndo(state, doc) };
        }
        if (action.mode === "v") {
          const sorted = [...list].sort((a, b) => a.r.y - b.r.y);
          const totalH = sorted.reduce((s, e) => s + e.r.h, 0);
          const gap = (bottom - top - totalH) / (sorted.length - 1);
          let cursor = top;
          for (const e of sorted) {
            doc = setNodeXY(doc, e.id, null, Math.round(cursor));
            cursor += e.r.h + gap;
          }
          return { ...state, ...withUndo(state, doc) };
        }
        if (nx !== null || ny !== null) {
          doc = setNodeXY(doc, id, nx !== null ? Math.round(nx) : null, ny !== null ? Math.round(ny) : null);
        }
      }
      return { ...state, ...withUndo(state, doc) };
    }
    case "reorder": {
      const hit = findInDoc(state.doc, action.id);
      if (!hit) return state;
      if (action.parentId !== null) {
        const target = findInDoc(state.doc, action.parentId);
        // Text nodes cannot take children.
        if (!target || target.node.kind === "text") return state;
      }
      const detached = { ...hit.node };
      let page = mapTree(state.doc.pages[hit.pageIndex], action.id, () => detached);
      if (hit.parent) {
        page = mapTree(page, hit.parent.id, (p) => ({
          ...p,
          children: p.children.filter((c) => c.id !== action.id),
        }));
      } else {
        // page-level reorder within pages[]
        const pages = state.doc.pages.filter((p) => p.id !== action.id);
        pages.splice(action.parentId === null ? Math.min(action.index, pages.length) : pages.length, 0, detached);
        return { ...state, ...withUndo(state, { ...state.doc, pages }) };
      }
      if (action.parentId === null) {
        const pages = [...state.doc.pages];
        pages[hit.pageIndex] = detached;
        return { ...state, ...withUndo(state, { ...state.doc, pages }) };
      }
      page = mapTree(page, action.parentId, (p) => {
        const children = [...p.children];
        children.splice(Math.min(action.index, children.length), 0, detached);
        return { ...p, children };
      });
      return { ...state, ...withUndo(state, mapPage(state.doc, hit.pageIndex, () => page)) };
    }
    case "create": {
      const doc = mapPage(state.doc, activePageIndex(state.doc, state.selectedIds), (page) => ({
        ...page,
        children: [...page.children, action.node],
      }));
      return { ...state, ...withUndo(state, doc), selectedIds: [action.node.id], primaryId: action.node.id };
    }
    case "add-page": {
      const last = state.doc.pages[state.doc.pages.length - 1];
      const page: StudioNode = {
        id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: `Screen ${state.doc.pages.length + 1}`,
        kind: "frame",
        x: (last?.x ?? 0) + 1600,
        y: last?.y ?? 0,
        width: 1440,
        height: 900,
        sizingW: "fixed",
        sizingH: "fixed",
        visible: true,
        devStatus: "design",
        style: { fills: [{ type: "solid", color: "#101418" }], effects: [] },
        children: [],
      };
      return { ...state, ...withUndo(state, { ...state.doc, pages: [...state.doc.pages, page] }), selectedIds: [page.id], primaryId: page.id };
    }
    case "delete-page": {
      if (state.doc.pages.length <= 1) return state;
      const pages = state.doc.pages.filter((_, i) => i !== action.pageIndex);
      return { ...state, ...withUndo(state, { ...state.doc, pages }), selectedIds: [], primaryId: null };
    }
    case "delete": {
      const hit = findInDoc(state.doc, action.id);
      if (!hit) return state;
      let doc: Document;
      if (!hit.parent) {
        if (state.doc.pages.length <= 1) return state;
        doc = { ...state.doc, pages: state.doc.pages.filter((p) => p.id !== action.id) };
      } else {
        doc = mapPage(state.doc, hit.pageIndex, (root) => removeMany(root, new Set([action.id])));
      }
      const selectedIds = state.selectedIds.filter((i) => i !== action.id);
      return {
        ...state,
        ...withUndo(state, doc),
        selectedIds,
        primaryId: state.primaryId === action.id ? selectedIds[selectedIds.length - 1] ?? null : state.primaryId,
      };
    }
    case "delete-set": {
      const ids = new Set(action.ids);
      if (ids.size === 0) return state;
      const remainingPages = state.doc.pages.filter((p) => !ids.has(p.id));
      if (remainingPages.length === 0) return state;
      const doc: Document = { ...state.doc, pages: remainingPages.map((p) => removeMany(p, ids)) };
      const selectedIds = state.selectedIds.filter((i) => !ids.has(i));
      return {
        ...state,
        ...withUndo(state, doc),
        selectedIds,
        primaryId: ids.has(state.primaryId ?? "") ? selectedIds[selectedIds.length - 1] ?? null : state.primaryId,
      };
    }
    case "duplicate": {
      const hit = findInDoc(state.doc, action.id);
      if (!hit) return state;
      const copy = reId(hit.node);
      if (!hit.parent) {
        return { ...state, ...withUndo(state, { ...state.doc, pages: [...state.doc.pages, { ...copy, x: hit.node.x + 80, y: hit.node.y + 80 }] }), selectedIds: [copy.id], primaryId: copy.id };
      }
      const doc = mapPage(state.doc, hit.pageIndex, (root) =>
        mapTree(root, hit.parent!.id, (p) => ({ ...p, children: [...p.children, copy] }))
      );
      return { ...state, ...withUndo(state, doc), selectedIds: [copy.id], primaryId: copy.id };
    }
    case "duplicate-set": {
      let doc = state.doc;
      const newIds: string[] = [];
      for (const id of action.ids) {
        const hit = findInDoc(doc, id);
        if (!hit) continue;
        const copy = reId(hit.node);
        newIds.push(copy.id);
        if (!hit.parent) {
          doc = { ...doc, pages: [...doc.pages, { ...copy, x: hit.node.x + 80, y: hit.node.y + 80 }] };
        } else {
          doc = mapPage(doc, hit.pageIndex, (root) => mapTree(root, hit.parent!.id, (p) => ({ ...p, children: [...p.children, copy] })));
        }
      }
      if (newIds.length === 0) return state;
      return { ...state, ...withUndo(state, doc), selectedIds: newIds, primaryId: newIds[newIds.length - 1] };
    }
    case "copy": {
      const clipboard = state.selectedIds
        .map((id) => findInDoc(state.doc, id))
        .filter((hit): hit is NodeHit => !!hit)
        .map((hit) => deepClone(hit.node));
      return { ...state, clipboard };
    }
    case "paste": {
      if (state.clipboard.length === 0) return state;
      const pageIndex = activePageIndex(state.doc, state.selectedIds);
      const copies = state.clipboard.map((n) => reId({ ...n, x: n.x + 20, y: n.y + 20 }));
      const doc = mapPage(state.doc, pageIndex, (page) => ({
        ...page,
        children: [...page.children, ...copies],
      }));
      const ids = copies.map((c) => c.id);
      return { ...state, ...withUndo(state, doc), selectedIds: ids, primaryId: ids[ids.length - 1] };
    }
    case "load-document":
      return { ...state, ...withUndo(state, action.doc), selectedIds: [], primaryId: null };
    case "restore":
      return { ...state, doc: action.doc, selectedIds: [], primaryId: null };
    case "undo": {
      if (state.undoStack.length === 0) return state;
      const prev = state.undoStack[state.undoStack.length - 1];
      return {
        ...state,
        doc: { ...prev, mode: state.doc.mode },
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, state.doc].slice(-UNDO_LIMIT),
      };
    }
    case "redo": {
      if (state.redoStack.length === 0) return state;
      const next = state.redoStack[state.redoStack.length - 1];
      return {
        ...state,
        doc: { ...next, mode: state.doc.mode },
        undoStack: [...state.undoStack, state.doc].slice(-UNDO_LIMIT),
        redoStack: state.redoStack.slice(0, -1),
      };
    }
    default:
      return state;
  }
}

export function makeInitialState(): AppState {
  return {
    doc: makeInitialDocument(),
    selectedIds: [],
    primaryId: null,
    tool: "select",
    devMode: false,
    zoom: 0.55,
    panX: 40,
    panY: 40,
    toast: null,
    clipboard: [],
    undoStack: [],
    redoStack: [],
    lastEdit: null,
  };
}

const StoreContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, makeInitialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): { state: AppState; dispatch: React.Dispatch<Action> } {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore outside StoreProvider");
  return ctx;
}
