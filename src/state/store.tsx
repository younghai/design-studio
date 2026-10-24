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
  | { type: "move"; id: string; dx: number; dy: number }
  | { type: "resize"; id: string; width: number; height: number }
  | { type: "set-props"; id: string; patch: NodePatch }
  | { type: "reorder"; id: string; parentId: string | null; index: number }
  | { type: "create"; node: StudioNode; parentId: string | null }
  | { type: "delete"; id: string }
  | { type: "duplicate"; id: string }
  | { type: "set-mode"; mode: Mode }
  | { type: "set-variable"; collection: string; path: string; mode: Mode; value: string }
  | { type: "set-tool"; tool: Tool }
  | { type: "set-devmode"; on: boolean }
  | { type: "set-viewport"; zoom?: number; panX?: number; panY?: number }
  | { type: "toast"; message: string | null }
  | { type: "copy"; id: string }
  | { type: "paste" }
  | { type: "load-document"; doc: Document }
  | { type: "restore"; doc: Document }
  | { type: "undo" }
  | { type: "redo" };

export interface AppState {
  doc: Document;
  selectedId: string | null;
  tool: Tool;
  devMode: boolean;
  zoom: number;
  panX: number;
  panY: number;
  toast: string | null;
  clipboard: StudioNode | null;
  undoStack: Document[];
  redoStack: Document[];
}

export const UNDO_LIMIT = 50;

export function findNode(
  root: StudioNode,
  id: string
): { node: StudioNode; parent: StudioNode | null; index: number } | null {
  if (root.id === id) return { node: root, parent: null, index: 0 };
  for (let i = 0; i < root.children.length; i += 1) {
    const hit = findNode(root.children[i], id);
    if (hit) return hit;
  }
  return null;
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

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "select":
      return { ...state, selectedId: action.id };
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
    case "copy": {
      const hit = findNode(state.doc.root, action.id);
      if (!hit) return state;
      return { ...state, clipboard: deepClone(hit.node) };
    }
    case "paste": {
      if (!state.clipboard) return state;
      const copy = reId({ ...state.clipboard, x: state.clipboard.x + 20, y: state.clipboard.y + 20 });
      const doc = {
        ...state.doc,
        root: mapTree(state.doc.root, state.doc.root.id, (p) => ({
          ...p,
          children: [...p.children, copy],
        })),
      };
      return { ...state, ...withUndo(state, doc), selectedId: copy.id };
    }
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
    case "move": {
      const hit = findNode(state.doc.root, action.id);
      if (!hit || !hit.parent) {
        const doc = {
          ...state.doc,
          root: mapTree(state.doc.root, action.id, (n) => ({ ...n, x: n.x + action.dx, y: n.y + action.dy })),
        };
        return { ...state, ...withUndo(state, doc) };
      }
      const parent = hit.parent;
      if (parent.layout) {
        const horizontal = parent.layout.dir === "row";
        const pos = horizontal ? hit.node.x + action.dx : hit.node.y + action.dy;
        const siblings = parent.children;
        let index = siblings.findIndex((c) => c.id === action.id);
        const posOf = (c: StudioNode) => (horizontal ? c.x : c.y);
        while (index > 0 && posOf(siblings[index - 1]) > pos) index -= 1;
        while (index < siblings.length - 1 && posOf(siblings[index + 1]) < pos) index += 1;
        const reordered = siblings.filter((c) => c.id !== action.id);
        reordered.splice(index, 0, hit.node);
        const doc = {
          ...state.doc,
          root: mapTree(state.doc.root, parent.id, (n) => ({ ...n, children: reordered })),
        };
        return { ...state, ...withUndo(state, doc) };
      }
      const doc = {
        ...state.doc,
        root: mapTree(state.doc.root, action.id, (n) => ({ ...n, x: n.x + action.dx, y: n.y + action.dy })),
      };
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
      return { ...state, ...withUndo(state, doc), selectedId: action.node.id };
    }
    case "delete": {
      if (state.doc.root.id === action.id) return state;
      const doc = {
        ...state.doc,
        root: removeNode(state.doc.root, action.id),
      };
      return { ...state, ...withUndo(state, doc), selectedId: null };
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
      return { ...state, ...withUndo(state, doc), selectedId: copy.id };
    }
    case "load-document":
      return { ...state, ...withUndo(state, action.doc), selectedId: null };
    case "restore":
      return { ...state, doc: action.doc, selectedId: null };
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

function removeNode(node: StudioNode, id: string): StudioNode {
  return { ...node, children: node.children.filter((c) => c.id !== id).map((c) => removeNode(c, id)) };
}

export function makeInitialState(): AppState {
  return {
    doc: makeInitialDocument(),
    selectedId: null,
    tool: "select",
    devMode: false,
    zoom: 0.55,
    panX: 40,
    panY: 40,
    toast: null,
    clipboard: null,
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
