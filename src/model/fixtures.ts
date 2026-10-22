import type {
  Document,
  LayoutDir,
  LayoutSpec,
  Mode,
  StudioNode,
  StyleProps,
  TextProps,
  VariableCollection,
} from "./types";
import { defaultLayout, textHeight, textWidth } from "./types";
import easeSpec from "../fixtures/easeui-agent-console.spec.json";

interface SpecNode {
  name?: string;
  preset?: string;
  kind?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  stroke_width?: number;
  radius?: number;
  text?: string;
  font_size?: number;
  font_weight?: number;
  color?: string;
  layout?: {
    dir?: string;
    gap?: number;
    padding?: number[];
    align?: string;
    justify?: string;
  };
  children?: SpecNode[];
}

interface PresetDefault {
  style?: StyleProps;
  text?: Partial<TextProps>;
  layout?: { dir?: LayoutDir; gap?: number; padding?: [number, number, number, number] };
}

const PRESETS: Record<string, PresetDefault> = {
  "easeui-screen": { style: { fill: "#0d1117" } },
  "easeui-panel": { style: { radius: 12 } },
  "easeui-card": {
    style: {
      fill: "$easeui.bg.panel",
      stroke: "$easeui.border.subtle",
      strokeWidth: 1,
      radius: 12,
    },
  },
  "easeui-badge": {
    style: { fill: "$easeui.accent.blue", radius: 999 },
    text: { fontSize: 10, fontWeight: 600, color: "#ffffff" },
    layout: { dir: "row", padding: [3, 8, 3, 8] },
  },
  "easeui-button-primary": {
    style: { fill: "$easeui.accent.blue", radius: 8 },
    text: { fontSize: 12, fontWeight: 600, color: "#ffffff" },
    layout: { dir: "row", padding: [6, 14, 6, 14] },
  },
  "easeui-button-secondary": {
    style: {
      fill: "$easeui.bg.panel",
      stroke: "$easeui.border.subtle",
      strokeWidth: 1,
      radius: 8,
    },
    text: { fontSize: 12, fontWeight: 500, color: "$easeui.text.primary" },
    layout: { dir: "row", padding: [6, 14, 6, 14] },
  },
};

export const CORE_COLLECTION: VariableCollection = {
  id: "core",
  name: "core",
  kind: "COLOR",
  variables: {
    "bg.canvas": { light: "#f0f2f5", dark: "#141414" },
    "bg.surface": { light: "#ffffff", dark: "#1e1e1e" },
    "text.primary": { light: "#111418", dark: "#f5f5f5" },
    "border.default": { light: "#d5d9e0", dark: "#383838" },
    "brand": { light: "#0d99ff", dark: "#0d99ff" },
  },
};

export const EASEUI_COLLECTION: VariableCollection = {
  id: "easeui",
  name: "easeui",
  kind: "COLOR",
  variables: {
    "bg.panel": { light: "#ffffff", dark: "#161b22" },
    "border.subtle": { light: "#e5e9ef", dark: "#2c3440" },
    "text.primary": { light: "#10161d", dark: "#f0f3f6" },
    "text.secondary": { light: "#46535f", dark: "#9aa7b4" },
    "text.muted": { light: "#7a8694", dark: "#6e7b8a" },
    "accent.blue": { light: "#2563eb", dark: "#3b82f6" },
    "accent.emerald": { light: "#059669", dark: "#10b981" },
    "accent.orange": { light: "#d97706", dark: "#f59e0b" },
    "accent.violet": { light: "#7c3aed", dark: "#8b5cf6" },
  },
};

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `n${idCounter}`;
}

function toLayout(spec: SpecNode, preset: PresetDefault | undefined): LayoutSpec | undefined {
  const l = spec.layout;
  if (!l && !preset?.layout) return undefined;
  const base = defaultLayout((l?.dir as LayoutDir) ?? preset?.layout?.dir ?? "column");
  const merged: LayoutSpec = {
    dir: (l?.dir as LayoutDir) ?? preset?.layout?.dir ?? base.dir,
    gap: l?.gap ?? preset?.layout?.gap ?? 0,
    padding: (l?.padding as [number, number, number, number]) ?? preset?.layout?.padding ?? [0, 0, 0, 0],
    align: (l?.align as LayoutSpec["align"]) ?? "start",
    justify: (l?.justify as LayoutSpec["justify"]) ?? "start",
  };
  return merged;
}

function toTextProps(spec: SpecNode, preset: PresetDefault | undefined): TextProps {
  return {
    text: spec.text ?? "",
    fontSize: spec.font_size ?? preset?.text?.fontSize ?? 12,
    fontWeight: spec.font_weight ?? preset?.text?.fontWeight ?? 400,
    color: spec.color ?? preset?.text?.color,
    lineHeight: 1.3,
  };
}

export function specNodeToNode(spec: SpecNode): StudioNode {
  const preset = spec.preset ? PRESETS[spec.preset] : undefined;
  const isText = spec.kind === "text";
  const text = isText || spec.text !== undefined ? toTextProps(spec, preset) : undefined;

  const node: StudioNode = {
    id: nextId(),
    name: spec.name ?? spec.preset ?? spec.kind ?? "node",
    kind: isText ? "text" : "frame",
    x: spec.x ?? 0,
    y: spec.y ?? 0,
    width: spec.width ?? 0,
    height: spec.height ?? 0,
    sizingW: spec.width !== undefined ? "fixed" : "hug",
    sizingH: spec.height !== undefined ? "fixed" : "hug",
    visible: true,
    layout: toLayout(spec, preset),
    text,
    style: {
      fill: spec.fill ?? preset?.style?.fill,
      stroke: spec.stroke ?? preset?.style?.stroke,
      strokeWidth: spec.stroke_width ?? preset?.style?.strokeWidth,
      radius: spec.radius ?? preset?.style?.radius,
      opacity: 1,
    },
    children: [],
  };

  if (node.sizingW === "hug" && node.width === 0) node.width = textWidth(node);
  if (node.sizingH === "hug" && node.height === 0) node.height = textHeight(node);

  node.children = (spec.children ?? []).map(specNodeToNode);
  return node;
}

export function specToDocument(spec: SpecNode, mode: Mode = "dark"): Document {
  const root = specNodeToNode(spec);
  // A spec's root x/y are placement metadata from the source canvas (the
  // easeui fixture ships at y=1200). In the editor the root IS the document
  // origin, so normalize it to (0,0) or the whole screen renders off-view.
  root.x = 0;
  root.y = 0;
  return {
    schemaVersion: 1,
    name: spec.name ?? "Untitled",
    mode,
    collections: [CORE_COLLECTION, EASEUI_COLLECTION],
    root,
  };
}

export function makeInitialDocument(): Document {
  idCounter = 0;
  return specToDocument(easeSpec as SpecNode, "dark");
}
