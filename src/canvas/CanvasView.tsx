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
  kind: "move" | "resize" | "pan" | "marquee";
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

// Date.now() collides for two creations in the same millisecond (fast clicks,
// automated input); a module counter is unique for this session.
let createSeq = 0;
function uid(): string {
  createSeq += 1;
  return `c${Date.now()}-${createSeq}`;
}

const NEW_NODE_DEFAULTS: Record<Exclude<Tool, "select">, () => StudioNode> = {
  frame: () => ({
    id: uid(),
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
    id: uid(),
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
    id: uid(),
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
    id: uid(),
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

// Marquee selection: intersecting nodes, topmost per branch (a hit node
// absorbs the marquee for its whole subtree, like Figma's top-frame pick).
function marqueeHit(m: { x0: number; y0: number; x1: number; y1: number }, root: StudioNode): string[] {
  const left = Math.min(m.x0, m.x1);
  const right = Math.max(m.x0, m.x1);
  const top = Math.min(m.y0, m.y1);
  const bottom = Math.max(m.y0, m.y1);
  const hits: string[] = [];
  function walk(node: StudioNode, absX: number, absY: number): void {
    for (const child of node.children) {
      const cx = absX + child.x;
      const cy = absY + child.y;
      const intersects =
        child.visible &&
        cx < right &&
        cy < bottom &&
        cx + child.width > left &&
        cy + child.height > top;
      if (intersects) {
        hits.push(child.id);
      } else {
        walk(child, cx, cy);
      }
    }
  }
  walk(root, 0, 0);
  return hits;
}

function nodeStyle(node: StudioNode, doc: Document, override: LiveOverride | null): React.CSSProperties {  const fill = resolveColor(node.style.fill, doc);
  const stroke = resolveColor(node.style.stroke, doc);
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
  selectedIds: string[];
  showHandles: boolean;
  editId: string | null;
  interactive: boolean;
  onNodePointerDown: (e: React.PointerEvent, node: StudioNode) => void;
  onHandlePointerDown: (e: React.PointerEvent, node: StudioNode, handle: Handle) => void;
  onEditStart: (id: string) => void;
  onEditCommit: (id: string, value: string) => void;
  onEditCancel: () => void;
}

function NodeView(props: NodeViewProps): React.ReactElement {
  const { node, doc, live, selectedIds, showHandles, editId, interactive, onNodePointerDown, onHandlePointerDown, onEditStart, onEditCommit, onEditCancel } = props;
  const selected = selectedIds.includes(node.id);
  const editing = editId === node.id;
  // Rigid group move: while dragging one member of the selection, every other
  // member carries the same live offset.
  const groupLive =
    live && live.id !== node.id && selectedIds.includes(node.id) && selectedIds.includes(live.id) ? live : null;
  const effectiveLive = live?.id === node.id ? live : groupLive;
  const style = nodeStyle(node, doc, effectiveLive);
  const isText = node.kind === "text";
  const textColor = resolveColor(node.text?.color, doc);

  return (
    <div
      className={`canvas-node${selected ? " selected" : ""}`}
      style={style}
      onPointerDown={interactive && !editing ? (e) => onNodePointerDown(e, node) : undefined}
      onDoubleClick={
        interactive && !editing && node.text
          ? (e) => {
              e.stopPropagation();
              onEditStart(node.id);
            }
          : undefined
      }
    >
      {(isText || node.text) &&
        (editing ? (
          <textarea
            autoFocus
            defaultValue={node.text?.text}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              fontSize: node.text?.fontSize,
              fontWeight: node.text?.fontWeight,
              color: textColor,
              lineHeight: node.text?.lineHeight ?? 1.3,
              background: "rgba(0, 0, 0, 0.4)",
              border: "1px solid var(--ds-selection)",
              borderRadius: 2,
              padding: 0,
              margin: 0,
              resize: "none",
              overflow: "hidden",
              fontFamily: "inherit",
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={(e) => onEditCommit(node.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onEditCommit(node.id, (e.target as HTMLTextAreaElement).value);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onEditCancel();
              }
            }}
          />
        ) : (
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
        ))}
      {node.children.map((c) => (
        <NodeView key={c.id} {...props} node={c} />
      ))}
      {selected && interactive && !editing && showHandles && (
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
  const [editId, setEditId] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

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
    if (node.id === placed.id) {
      // The root frame covers the whole document; dragging from its
      // background starts a marquee over children (Figma canvas behavior),
      // a plain click deselects. The root stays selectable via the layers
      // panel.
      startMarquee(e);
      return;
    }
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      dispatch({ type: "select-toggle", id: node.id });
      // Modifier-click only changes membership; dragging after it moves the
      // resulting set, so still start a drag from this node.
      beginDrag(e, node);
      return;
    }
    if (!state.selectedIds.includes(node.id)) {
      dispatch({ type: "select", id: node.id });
    }
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
    // Select tool on empty canvas: start a marquee. A click (no drag)
    // deselects on pointerup.
    startMarquee(e);
  }

  function startMarquee(e: React.PointerEvent): void {
    // Capture on the viewport so a marquee that ends over a side panel or
    // outside the canvas still commits (uncaptured, the pointerup targets
    // the panel and never reaches the viewport handler).
    try {
      viewportRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // synthetic/embedded pointers may reject capture; in-canvas releases
      // still work without it
    }
    const p = toDoc(e);
    dragRef.current = {
      kind: "marquee",
      startDocX: p.x,
      startDocY: p.y,
      nodeX: p.x,
      nodeY: p.y,
      nodeW: 0,
      nodeH: 0,
      panX0: state.panX,
      panY0: state.panY,
    };
    setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  }

  function onPointerMove(e: React.PointerEvent): void {
    const drag = dragRef.current;
    if (!drag) return;
    const p = toDoc(e);
    const dx = p.x - drag.startDocX;
    const dy = p.y - drag.startDocY;
    if (drag.kind === "marquee") {
      setMarquee((m) => (m ? { ...m, x1: p.x, y1: p.y } : m));
      return;
    }
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

    if (drag?.kind === "marquee") {
      const m = marquee;
      setMarquee(null);
      if (m) {
        const w = Math.abs(m.x1 - m.x0);
        const h = Math.abs(m.y1 - m.y0);
        if (w < 3 || h < 3) {
          dispatch({ type: "select", id: null });
        } else {
          dispatch({ type: "select-many", ids: marqueeHit(m, placed) });
        }
      }
      return;
    }

    if (!drag || !drag.id || !drag.latest) {
      return;
    }
    const latest = drag.latest;
    if (drag.kind === "move") {
      if (latest.dx !== 0 || latest.dy !== 0) {
        if (state.selectedIds.includes(drag.id) && state.selectedIds.length > 1) {
          dispatch({ type: "move-set", ids: state.selectedIds, dx: latest.dx, dy: latest.dy });
        } else {
          dispatch({ type: "move", id: drag.id, dx: latest.dx, dy: latest.dy });
        }
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
          selectedIds={state.selectedIds.includes(placed.id) ? state.selectedIds.filter((i) => i !== placed.id) : state.selectedIds}
          showHandles={state.selectedIds.length === 1}
          editId={editId}
          interactive={interactive}
          onNodePointerDown={onNodePointerDown}
          onHandlePointerDown={onHandlePointerDown}
          onEditStart={setEditId}
          onEditCommit={(id, value) => {
            dispatch({ type: "set-props", id, patch: { text: { text: value } } });
            setEditId(null);
          }}
          onEditCancel={() => setEditId(null)}
        />
        {marquee && (
          <div
            style={{
              position: "absolute",
              left: Math.min(marquee.x0, marquee.x1),
              top: Math.min(marquee.y0, marquee.y1),
              width: Math.abs(marquee.x1 - marquee.x0),
              height: Math.abs(marquee.y1 - marquee.y0),
              border: "1px solid var(--ds-selection)",
              background: "rgba(13, 153, 255, 0.08)",
              pointerEvents: "none",
            }}
          />
        )}
      </div>
      <div className="canvas-statusbar">
        {Math.round(state.zoom * 100)}% · {state.doc.mode.toUpperCase()} · {state.doc.name}
      </div>
    </div>
  );
}
