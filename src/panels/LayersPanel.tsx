import React, { useState } from "react";
import type { StudioNode } from "../model/types";
import { findNode, useStore } from "../state/store";
import "./panels.css";

interface RowProps {
  node: StudioNode;
  depth: number;
  dropTargetId: string | null;
  setDropTargetId: (id: string | null) => void;
}

function LayerRow({ node, depth, dropTargetId, setDropTargetId }: RowProps): React.ReactElement {
  const { state, dispatch } = useStore();
  const [editing, setEditing] = useState(false);
  const selected = state.selectedId === node.id;

  return (
    <div
      className={`layer-row${selected ? " selected" : ""}${dropTargetId === node.id ? " drop-target" : ""}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      onClick={() => dispatch({ type: "select", id: node.id })}
      onDoubleClick={() => setEditing(true)}
      draggable
      onDragOver={(e) => {
        e.preventDefault();
        setDropTargetId(node.id);
      }}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", node.id)}
      onDrop={(e) => {
        e.preventDefault();
        setDropTargetId(null);
        const draggedId = e.dataTransfer.getData("text/plain");
        if (!draggedId || draggedId === node.id) return;
        const dragged = findNode(state.doc.root, draggedId);
        const target = findNode(state.doc.root, node.id);
        if (!dragged || !target || !dragged.parent || !target.parent) return;
        let index = target.parent.children.findIndex((c) => c.id === node.id) + 1;
        if (dragged.parent.id === target.parent.id) {
          const draggedIndex = dragged.parent.children.findIndex((c) => c.id === draggedId);
          if (draggedIndex < index) index -= 1;
        }
        dispatch({ type: "reorder", id: draggedId, parentId: target.parent.id, index });
      }}
    >
      <span className="layer-kind">{node.kind === "text" ? "T" : node.kind === "frame" ? "#" : node.kind === "ellipse" ? "○" : "□"}</span>
      {editing ? (
        <input
          autoFocus
          defaultValue={node.name}
          onBlur={(e) => {
            dispatch({ type: "set-props", id: node.id, patch: { name: e.target.value || node.name } });
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <span className="layer-name">{node.name}</span>
      )}
      <button
        className="layer-eye"
        title={node.visible ? "숨기기" : "보이기"}
        onClick={(e) => {
          e.stopPropagation();
          dispatch({ type: "set-props", id: node.id, patch: { visible: !node.visible } });
        }}
      >
        {node.visible ? "👁" : "—"}
      </button>
    </div>
  );
}

function TreeRows(props: { node: StudioNode; depth: number } & Pick<RowProps, "dropTargetId" | "setDropTargetId">): React.ReactElement {
  const { node, depth, dropTargetId, setDropTargetId } = props;
  return (
    <>
      <LayerRow node={node} depth={depth} dropTargetId={dropTargetId} setDropTargetId={setDropTargetId} />
      {node.children.map((c) => (
        <TreeRows key={c.id} node={c} depth={depth + 1} dropTargetId={dropTargetId} setDropTargetId={setDropTargetId} />
      ))}
    </>
  );
}

export default function LayersPanel(): React.ReactElement {
  const { state } = useStore();
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  return (
    <div className="layers-panel" onDragOver={(e) => e.preventDefault()}>
      <div className="panel-header">레이어</div>
      <TreeRows node={state.doc.root} depth={0} dropTargetId={dropTargetId} setDropTargetId={setDropTargetId} />
    </div>
  );
}
