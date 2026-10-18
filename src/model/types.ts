export type NodeKind = "frame" | "text" | "rect" | "ellipse";

export type LayoutDir = "row" | "column";

export type Align = "start" | "center" | "end";

export type Justify = "start" | "center" | "end" | "space-between";

export type Sizing = "hug" | "fixed" | "fill";

export interface LayoutSpec {
  dir: LayoutDir;
  gap: number;
  padding: [number, number, number, number];
  align: Align;
  justify: Justify;
}

export interface StyleProps {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  opacity?: number;
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

export interface Document {
  schemaVersion: 1;
  name: string;
  mode: Mode;
  collections: VariableCollection[];
  root: StudioNode;
}

export function defaultLayout(dir: LayoutDir = "column"): LayoutSpec {
  return { dir, gap: 0, padding: [0, 0, 0, 0], align: "start", justify: "start" };
}

export function textWidth(n: StudioNode): number {
  const fontSize = n.text?.fontSize ?? 12;
  const chars = n.text?.text.length ?? 0;
  return Math.round(chars * fontSize * 0.6 + 8);
}

export function textHeight(n: StudioNode): number {
  const fontSize = n.text?.fontSize ?? 12;
  const lineHeight = n.text?.lineHeight ?? 1.3;
  return Math.round(fontSize * lineHeight + 4);
}
