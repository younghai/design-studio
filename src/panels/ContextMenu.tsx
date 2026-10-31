import React, { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import type { DevStatus } from "../model/types";

export interface MenuTarget {
  x: number;
  y: number;
  nodeId: string | null;
}

const STATUS_ITEMS: { id: DevStatus; label: string }[] = [
  { id: "design", label: "설계중으로" },
  { id: "ready", label: "개발준비로" },
  { id: "done", label: "완료로" },
];

export default function ContextMenu({ target, onClose }: { target: MenuTarget; onClose: () => void }): React.ReactElement | null {
  const { state, dispatch } = useStore();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [onClose]);

  if (!target) return null;
  const ids = target.nodeId && state.selectedIds.includes(target.nodeId) ? state.selectedIds : target.nodeId ? [target.nodeId] : [];
  const has = ids.length > 0;

  const item = (label: string, action: () => void, disabled = false): React.ReactElement => (
    <button
      key={label}
      className="context-item"
      disabled={disabled}
      onClick={() => {
        action();
        onClose();
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: target.x, top: target.y }}
      role="menu"
      // The menu overlays the canvas viewport; without this, its pointerdown
      // bubbles to the viewport and starts a marquee whose pointer capture
      // retargets the click away from the menu item (onClick never fires).
      onPointerDown={(e) => e.stopPropagation()}
    >
      {has && item("복제 (⌘D)", () => dispatch({ type: "duplicate-set", ids }))}
      {has && item("복사 (⌘C)", () => dispatch({ type: "copy" }))}
      {item("붙여넣기 (⌘V)", () => dispatch({ type: "paste" }), state.clipboard.length === 0)}
      {has && item("삭제 (Del)", () => dispatch({ type: "delete-set", ids }))}
      {has && (
        <div className="context-sep">
          {STATUS_ITEMS.map((s) => item(s.label, () => dispatch({ type: "set-status", ids, status: s.id })))}
        </div>
      )}
      {item("새 화면 추가", () => dispatch({ type: "add-page" }))}
    </div>
  );
}
