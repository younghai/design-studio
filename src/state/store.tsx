import React, { createContext, useContext, useMemo, useReducer } from "react";
import type {
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
  | { type: "reorder"; id: string; parentId: string | null; index: number }
  | { type: "create"; node: StudioNode; parentId: string | null }
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
}

export const UNDO_LIMIT = 50;

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

export function mapTree(node: StudioNode, id: string, fn: (n: StudioNode) => StudioNode): StudioNode {
  if (node.id === id) return fn(node);
  return { ...node, children: node.children.map((c) => mapTree(c, id, fn)) };
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
    style: { ...node.style },
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
    style: patch.style ? { ...n.style, ...patch.style } : n.style,
    text: patch.text && n.text ? { ...n.text, ...patch.text } : n.text,
    layout: patch.layout && n.layout ? { ...n.layout, ...patch.layout } : n.layout,
  };
}

function withUndo(state: AppState, nextDoc: Document): Partial<AppState> {
  const undoStack = [...state.undoStack, state.doc].slice(-UNDO_LIMIT);
  return { doc: nextDoc, undoStack, redoStack: [] };
}

// Free nodes translate; children of an auto-layout parent reorder by the
// dragged position along the parent's main axis (relayout reassigns coords).
function applyMove(doc: Document, id: string, dx: number, dy: number): Document {
  const hit = findNode(doc.root, id);
  if (!hit) return doc;
  if (!hit.parent) {
    return { ...doc, root: mapTree(doc.root, id, (n) => ({ ...n, x: n.x + dx, y: n.y + dy })) };
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
    return { ...doc, root: mapTree(doc.root, parent.id, (n) => ({ ...n, children: reordered })) };
  }
  return { ...doc, root: mapTree(doc.root, id, (n) => ({ ...n, x: n.x + dx, y: n.y + dy })) };
}

function removeMany(node: StudioNode, ids: Set<string>): StudioNode {
  return { ...node, children: node.children.filter((c) => !ids.has(c.id)).map((c) => removeMany(c, ids)) };
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
      const doc = {
        ...state.doc,
        root: mapTree(state.doc.root, action.id, (n) => ({
          ...n,
          width: Math.max(1, action.width),
          height: Math.max(1, action.height),
        })),
      };
      return { ...state, ...withUndo(state, doc) };
    }
    case "set-props": {
      const doc = {
        ...state.doc,
        root: mapTree(state.doc.root, action.id, (n) => applyPatch(n, action.patch)),
      };
      return { ...state, ...withUndo(state, doc) };
    }
    case "reorder": {
      const hit = findNode(state.doc.root, action.id);
      if (!hit) return state;
      const detached = { ...hit.node };
      let root = mapTree(state.doc.root, action.id, () => detached);
      if (hit.parent) {
        root = mapTree(root, hit.parent.id, (p) => ({
          ...p,
          children: p.children.filter((c) => c.id !== action.id),
        }));
      }
      if (action.parentId === null) {
        root = detached;
      } else {
        root = mapTree(root, action.parentId, (p) => {
          const children = [...p.children];
          children.splice(Math.min(action.index, children.length), 0, detached);
          return { ...p, children };
        });
      }
      return { ...state, ...withUndo(state, { ...state.doc, root }) };
    }
    case "create": {
      const doc =
        action.parentId === null
          ? { ...state.doc, root: action.node }
          : {
              ...state.doc,
              root: mapTree(state.doc.root, action.parentId, (p) => ({
                ...p,
                children: [...p.children, action.node],
              })),
            };
      return { ...state, ...withUndo(state, doc), selectedIds: [action.node.id], primaryId: action.node.id };
    }
    case "delete": {
      if (state.doc.root.id === action.id) return state;
      const doc = { ...state.doc, root: removeMany(state.doc.root, new Set([action.id])) };
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
      if (ids.has(state.doc.root.id) || ids.size === 0) return state;
      const doc = { ...state.doc, root: removeMany(state.doc.root, ids) };
      const selectedIds = state.selectedIds.filter((i) => !ids.has(i));
      return {
        ...state,
        ...withUndo(state, doc),
        selectedIds,
        primaryId: ids.has(state.primaryId ?? "") ? selectedIds[selectedIds.length - 1] ?? null : state.primaryId,
      };
    }
    case "duplicate": {
      const hit = findNode(state.doc.root, action.id);
      if (!hit || !hit.parent) return state;
      const copy = reId(hit.node);
      const doc = {
        ...state.doc,
        root: mapTree(state.doc.root, hit.parent.id, (p) => ({
          ...p,
          children: [...p.children, copy],
        })),
      };
      return { ...state, ...withUndo(state, doc), selectedIds: [copy.id], primaryId: copy.id };
    }
    case "duplicate-set": {
      let root = state.doc.root;
      const newIds: string[] = [];
      for (const id of action.ids) {
        const hit = findNode(root, id);
        if (!hit || !hit.parent) continue;
        const copy = reId(hit.node);
        newIds.push(copy.id);
        root = mapTree(root, hit.parent.id, (p) => ({ ...p, children: [...p.children, copy] }));
      }
      if (newIds.length === 0) return state;
      return { ...state, ...withUndo(state, { ...state.doc, root }), selectedIds: newIds, primaryId: newIds[newIds.length - 1] };
    }
    case "copy": {
      const clipboard = state.selectedIds
        .map((id) => findNode(state.doc.root, id))
        .filter((hit): hit is { node: StudioNode; parent: StudioNode; index: number } => !!hit && !!hit.parent)
        .map((hit) => deepClone(hit.node));
      return { ...state, clipboard };
    }
    case "paste": {
      if (state.clipboard.length === 0) return state;
      const copies = state.clipboard.map((n) => reId({ ...n, x: n.x + 20, y: n.y + 20 }));
      const doc = {
        ...state.doc,
        root: mapTree(state.doc.root, state.doc.root.id, (p) => ({
          ...p,
          children: [...p.children, ...copies],
        })),
      };
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
