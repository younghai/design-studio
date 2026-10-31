export type NodeKind = "frame" | "text" | "rect" | "ellipse";

export type LayoutDir = "row" | "column";

export type Align = "start" | "center" | "end";

export type Justify = "start" | "center" | "end" | "space-between";

export type Sizing = "hug" | "fixed" | "fill";

export type DevStatus = "design" | "ready" | "done";

export interface LayoutSpec {
  dir: LayoutDir;
  gap: number;
  padding: [number, number, number, number];
  align: Align;
  justify: Justify;
}

export type Paint =
  | { type: "solid"; color: string }
  | { type: "linear"; angle: number; stops: { color: string; pos: number }[] }
  | { type: "image"; src: string };

export interface DropShadowEffect {
  type: "drop-shadow";
  x: number;
  y: number;
  blur: number;
  color: string;
}

export type Effect = DropShadowEffect;

export interface StyleProps {
  fills: Paint[];
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  opacity?: number;
  effects: Effect[];
}

export interface TextProps {
  text: string;
  fontSize: number;
  fontWeight: number;
  color?: string;
  lineHeight?: number;
}

export interface StudioNode {
  id: string;
  name: string;
  kind: NodeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  sizingW: Sizing;
  sizingH: Sizing;
  visible: boolean;
  devStatus: DevStatus;
  layout?: LayoutSpec;
  text?: TextProps;
  style: StyleProps;
  children: StudioNode[];
}

export type Mode = "light" | "dark";

export interface VariableValue {
  light: string;
  dark: string;
}

export interface VariableCollection {
  id: string;
  name: string;
  kind: "COLOR";
  variables: Record<string, VariableValue>;
}

/**
 * schemaVersion history:
 *  1 — single root: { root: StudioNode, fill: string }
 *  2 — multi-screen pages[] + paint fills[] + effects + devStatus
 */
export interface Document {
  schemaVersion: 2;
  name: string;
  mode: Mode;
  collections: VariableCollection[];
  /** Top-level screen frames laid out freely on the canvas. Min length 1. */
  pages: StudioNode[];
}

export function solid(color: string): Paint {
  return { type: "solid", color };
}

export function defaultLayout(dir: LayoutDir = "column"): LayoutSpec {
  return { dir, gap: 0, padding: [0, 0, 0, 0], align: "start", justify: "start" };
}

// src/model stays framework-free, so real text measurement is injected from
// the app layer (see canvas/measureBridge). The heuristic keeps the core and
// the CLI usable in Node.
export type TextMeasurer = (text: string, fontSize: number, fontWeight: number) => { w: number; h: number };
let measurer: TextMeasurer | null = null;
export function setTextMeasurer(fn: TextMeasurer | null): void {
  measurer = fn;
}
export function measureText(text: string, fontSize: number, fontWeight: number): { w: number; h: number } {
  if (measurer) return measurer(text, fontSize, fontWeight);
  return heuristicMeasure(text, fontSize, fontWeight);
}
export function heuristicMeasure(text: string, fontSize: number, fontWeight: number): { w: number; h: number } {
  return {
    w: Math.round(text.length * fontSize * (fontWeight >= 600 ? 0.62 : 0.6) + 8),
    h: Math.round(fontSize * 1.3 + 4),
  };
}
export function textWidth(n: StudioNode): number {
  const m = measureText(n.text?.text ?? "", n.text?.fontSize ?? 12, n.text?.fontWeight ?? 400);
  return m.w;
}
export function textHeight(n: StudioNode): number {
  const m = measureText(n.text?.text ?? "", n.text?.fontSize ?? 12, n.text?.fontWeight ?? 400);
  return m.h;
}
