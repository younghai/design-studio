import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Document, StudioNode } from "../model/types";
import { textHeight, textWidth } from "../model/types";
import { relayoutTree } from "../model/relayout";
import { resolveColor } from "../model/variables";
import { useStore } from "../state/store";
import type { Tool } from "../state/store";
import "./canvas.css";

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface LiveOverride {
  id: string;
  dx: number;
  dy: number;
  w?: number;
  h?: number;
}

interface DragState {
  kind: "move" | "resize" | "pan";
  id?: string;
  handle?: Handle;
  startDocX: number;
  startDocY: number;
  nodeX: number;
  nodeY: number;
  nodeW: number;
  nodeH: number;
  panX0: number;
  panY0: number;
  latest?: { dx: number; dy: number; w?: number; h?: number };
}

const HANDLE_CURSOR: Record<Handle, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

const HANDLE_POS: Record<Handle, { left: string; top: string; transform: string }> = {
  nw: { left: "0%", top: "0%", transform: "translate(-50%, -50%)" },
  n: { left: "50%", top: "0%", transform: "translate(-50%, -50%)" },
  ne: { left: "100%", top: "0%", transform: "translate(-50%, -50%)" },
  e: { left: "100%", top: "50%", transform: "translate(-50%, -50%)" },
  se: { left: "100%", top: "100%", transform: "translate(-50%, -50%)" },
  s: { left: "50%", top: "100%", transform: "translate(-50%, -50%)" },
  sw: { left: "0%", top: "100%", transform: "translate(-50%, -50%)" },
  w: { left: "0%", top: "50%", transform: "translate(-50%, -50%)" },
};

const NEW_NODE_DEFAULTS: Record<Exclude<Tool, "select">, () => StudioNode> = {
  frame: () => ({
    id: `c${Date.now()}`,
    name: "Frame",
    kind: "frame",
    x: 0,
    y: 0,
    width: 240,
    height: 140,
    sizingW: "fixed",
    sizingH: "fixed",
    visible: true,
    style: { fill: "$core.bg.surface", stroke: "$core.border.default", strokeWidth: 1, radius: 8, opacity: 1 },
    children: [],
  }),
  text: () => ({
    id: `c${Date.now()}`,
    name: "Text",
    kind: "text",
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    sizingW: "hug",
    sizingH: "hug",
    visible: true,
    text: { text: "Text", fontSize: 14, fontWeight: 400, color: "$core.text.primary", lineHeight: 1.3 },
    style: { opacity: 1 },
    children: [],
  }),
  rect: () => ({
    id: `c${Date.now()}`,
    name: "Rectangle",
    kind: "rect",
    x: 0,
    y: 0,
    width: 120,
    height: 80,
    sizingW: "fixed",
    sizingH: "fixed",
    visible: true,
    style: { fill: "$core.brand", opacity: 1 },
    children: [],
  }),
  ellipse: () => ({
    id: `c${Date.now()}`,
    name: "Ellipse",
    kind: "ellipse",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    sizingW: "fixed",
    sizingH: "fixed",
    visible: true,
    style: { fill: "$core.accent.violet", radius: 999, opacity: 1 },
    children: [],
  }),
};

function nodeStyle(node: StudioNode, doc: Document, live: LiveOverride | null): React.CSSProperties {
  const fill = resolveColor(node.style.fill, doc);
  const stroke = resolveColor(node.style.stroke, doc);
  const override = live?.id === node.id ? live : null;
  const isEllipse = node.kind === "ellipse";
  return {
    left: node.x + (override?.dx ?? 0),
    top: node.y + (override?.dy ?? 0),
    width: override?.w ?? node.width,
    height: override?.h ?? node.height,
    background: fill,
    border: stroke && node.style.strokeWidth ? `${node.style.strokeWidth}px solid ${stroke}` : undefined,
    borderRadius: isEllipse ? "50%" : node.style.radius,
    opacity: node.style.opacity ?? 1,
    display: node.visible ? undefined : "none",
  };
}

interface NodeViewProps {
  node: StudioNode;
  doc: Document;
  live: LiveOverride | null;
  selectedId: string | null;
  interactive: boolean;
  onNodePointerDown: (e: React.PointerEvent, node: StudioNode) => void;
  onHandlePointerDown: (e: React.PointerEvent, node: StudioNode, handle: Handle) => void;
}

function NodeView(props: NodeViewProps): React.ReactElement {
  const { node, doc, live, selectedId, interactive, onNodePointerDown, onHandlePointerDown } = props;
  const selected = selectedId === node.id;
  const style = nodeStyle(node, doc, live);
  const isText = node.kind === "text";
  const textColor = resolveColor(node.text?.color, doc);

  return (
    <div
      className={`canvas-node${selected ? " selected" : ""}`}
      style={style}
      onPointerDown={interactive ? (e) => onNodePointerDown(e, node) : undefined}
    >
      {(isText || node.text) && (
        <span
          style={{
            fontSize: node.text?.fontSize,
            fontWeight: node.text?.fontWeight,
            color: textColor,
            lineHeight: node.text?.lineHeight ?? 1.3,
            whiteSpace: "pre",
            padding: isText ? 0 : "0 8px",
            display: "block",
          }}
        >
          {node.text?.text}
        </span>
      )}
      {node.children.map((c) => (
        <NodeView key={c.id} {...props} node={c} />
      ))}
      {selected && interactive && (
        <>
          {(Object.keys(HANDLE_POS) as Handle[]).map((h) => (
            <div
              key={h}
              className="selection-handle"
              style={{ ...HANDLE_POS[h], cursor: HANDLE_CURSOR[h] }}
              onPointerDown={(e) => onHandlePointerDown(e, node, h)}
            />
          ))}
        </>
      )}
    </div>
  );
}

export default function CanvasView(): React.ReactElement {
  const { state, dispatch } = useStore();
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const spaceRef = useRef(false);
  const [live, setLive] = useState<LiveOverride | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);

  const placed = useMemo(() => relayoutTree(state.doc.root), [state.doc.root]);
  const interactive = state.tool === "select";

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        spaceRef.current = true;
        setSpaceDown(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceRef.current = false;
        setSpaceDown(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const nextZoom = Math.min(4, Math.max(0.1, state.zoom * factor));
      const ratio = nextZoom / state.zoom;
      dispatch({
        type: "set-viewport",
        zoom: nextZoom,
        panX: mx - (mx - state.panX) * ratio,
        panY: my - (my - state.panY) * ratio,
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [state.zoom, state.panX, state.panY, dispatch]);

  function toDoc(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left - state.panX) / state.zoom,
      y: (e.clientY - rect.top - state.panY) / state.zoom,
    };
  }

  function beginDrag(
    e: React.PointerEvent,
    node: StudioNode | null,
    handle?: Handle
  ): void {
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Synthetic/embedded pointers have no active pointerId to capture.
      // The viewport-level move/up handlers still receive events while the
      // pointer stays inside the canvas.
    }
    const p = toDoc(e);
    const base: DragState = {
      kind: "pan",
      startDocX: p.x,
      startDocY: p.y,
      nodeX: 0,
      nodeY: 0,
      nodeW: 0,
      nodeH: 0,
      panX0: state.panX,
      panY0: state.panY,
    };
    if (node && handle) {
      dragRef.current = {
        ...base,
        kind: "resize",
        id: node.id,
        handle,
        nodeX: node.x,
        nodeY: node.y,
        nodeW: node.width,
        nodeH: node.height,
      };
    } else if (node) {
      dragRef.current = {
        ...base,
        kind: "move",
        id: node.id,
        nodeX: node.x,
        nodeY: node.y,
        nodeW: node.width,
        nodeH: node.height,
      };
    } else {
      dragRef.current = base;
    }
  }

  function onNodePointerDown(e: React.PointerEvent, node: StudioNode): void {
    if (!interactive || spaceRef.current) return;
    dispatch({ type: "select", id: node.id });
    beginDrag(e, node);
  }

  function onHandlePointerDown(e: React.PointerEvent, node: StudioNode, handle: Handle): void {
    if (!interactive) return;
    beginDrag(e, node, handle);
  }

  function onViewportPointerDown(e: React.PointerEvent): void {
    if (spaceRef.current) {
      beginDrag(e, null);
      return;
    }
    if (!interactive) {
      const p = toDoc(e);
      const maker = NEW_NODE_DEFAULTS[state.tool as Exclude<Tool, "select">];
      const node = maker();
      if (node.kind === "text") {
        node.width = textWidth(node);
        node.height = textHeight(node);
      }
      node.x = p.x;
      node.y = p.y;
      dispatch({ type: "create", node, parentId: state.doc.root.id });
      dispatch({ type: "set-tool", tool: "select" });
      return;
    }
    dispatch({ type: "select", id: null });
  }

  function onPointerMove(e: React.PointerEvent): void {
    const drag = dragRef.current;
    if (!drag) return;
    const p = toDoc(e);
    const dx = p.x - drag.startDocX;
    const dy = p.y - drag.startDocY;
    if (drag.kind === "pan") {
      dispatch({
        type: "set-viewport",
        panX: drag.panX0 + dx * state.zoom,
        panY: drag.panY0 + dy * state.zoom,
      });
      return;
    }
    if (!drag.id) return;
    if (drag.kind === "move") {
      const next = { dx, dy };
      drag.latest = next;
      setLive({ id: drag.id, dx, dy });
      return;
    }
    const h = drag.handle as Handle;
    const west = h.includes("w");
    const north = h[0] === "n";
    const east = h.includes("e") && !west;
    const south = h.includes("s") && !north;
    let w = drag.nodeW;
    let hh = drag.nodeH;
    let ddx = 0;
    let ddy = 0;
    if (east) w = Math.max(1, drag.nodeW + dx);
    if (west) {
      w = Math.max(1, drag.nodeW - dx);
      ddx = drag.nodeW - w;
    }
    if (south) hh = Math.max(1, drag.nodeH + dy);
    if (north) {
      hh = Math.max(1, drag.nodeH - dy);
      ddy = drag.nodeH - hh;
    }
    const next = { dx: ddx, dy: ddy, w, h: hh };
    drag.latest = next;
    setLive({ id: drag.id, dx: ddx, dy: ddy, w, h: hh });
  }

  function onPointerUp(): void {
    const drag = dragRef.current;
    dragRef.current = null;
    setLive(null);
    if (!drag || !drag.id || !drag.latest) {
      return;
    }
    const latest = drag.latest;
    if (drag.kind === "move") {
      if (latest.dx !== 0 || latest.dy !== 0) {
        dispatch({ type: "move", id: drag.id, dx: latest.dx, dy: latest.dy });
      }
    } else if (drag.kind === "resize") {
      dispatch({
        type: "set-props",
        id: drag.id,
        patch: {
          x: drag.nodeX + (latest.dx ?? 0),
          y: drag.nodeY + (latest.dy ?? 0),
          width: latest.w ?? drag.nodeW,
          height: latest.h ?? drag.nodeH,
          sizingW: "fixed",
          sizingH: "fixed",
        },
      });
    }
  }

  return (
    <div
      ref={viewportRef}
      className={`canvas-viewport${spaceDown ? " panning" : ""}${interactive ? "" : " creating"}`}
      onPointerDown={onViewportPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        className="canvas-surface"
        style={{ transform: `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})` }}
      >
        <NodeView
          node={placed}
          doc={state.doc}
          live={live}
          selectedId={state.selectedId === placed.id ? null : state.selectedId}
          interactive={interactive}
          onNodePointerDown={onNodePointerDown}
          onHandlePointerDown={onHandlePointerDown}
        />
      </div>
      <div className="canvas-statusbar">
        {Math.round(state.zoom * 100)}% · {state.doc.mode.toUpperCase()} · {state.doc.name}
      </div>
    </div>
  );
}
