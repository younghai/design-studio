import React from "react";
import { findNode, useStore } from "../state/store";
import type { NodePatch } from "../state/store";
import { isAlias } from "../model/variables";
import { defaultLayout } from "../model/types";
import type { Sizing } from "../model/types";
import "./panels.css";

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}): React.ReactElement {
  return (
    <label>
      {label}
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export default function Inspector(): React.ReactElement {
  const { state, dispatch } = useStore();
  const hit = state.selectedId ? findNode(state.doc.root, state.selectedId) : null;
  if (!hit) {
    return (
      <div className="inspector-panel">
        <div className="panel-header">인스펙터</div>
        <div className="inspector-section">
          <p style={{ color: "var(--ds-text-dim)", margin: 0 }}>선택된 노드가 없습니다</p>
        </div>
      </div>
    );
  }

  const node = hit.node;
  const allVariables = state.doc.collections.flatMap((c) => Object.keys(c.variables).map((p) => `$${c.name}.${p}`));
  const fillIsAlias = isAlias(node.style.fill);
  const textColorIsAlias = isAlias(node.text?.color);

  function patch(patchObj: NodePatch): void {
    dispatch({ type: "set-props", id: node.id, patch: patchObj });
  }

  return (
    <div className="inspector-panel">
      <div className="panel-header">인스펙터</div>

      <div className="inspector-section">
        <h4>노드</h4>
        <label className="field-wide">
          이름
          <input value={node.name} onChange={(e) => patch({ name: e.target.value })} />
        </label>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button onClick={() => dispatch({ type: "duplicate", id: node.id })}>복제 (⌘D)</button>
          <button onClick={() => dispatch({ type: "delete", id: node.id })}>삭제 (Del)</button>
        </div>
      </div>

      <div className="inspector-section">
        <h4>위치 / 크기</h4>
        <div className="field-grid">
          <NumField label="X" value={node.x} onChange={(v) => patch({ x: v })} />
          <NumField label="Y" value={node.y} onChange={(v) => patch({ y: v })} />
          <NumField label="W" value={node.width} onChange={(v) => patch({ width: v, sizingW: "fixed" })} />
          <NumField label="H" value={node.height} onChange={(v) => patch({ height: v, sizingH: "fixed" })} />
        </div>
        <div className="field-grid" style={{ marginTop: 6 }}>
          <label>
            W 크기
            <select value={node.sizingW} onChange={(e) => patch({ sizingW: e.target.value as Sizing })}>
              <option value="fixed">고정</option>
              <option value="hug">Hug</option>
              <option value="fill">Fill</option>
            </select>
          </label>
          <label>
            H 크기
            <select value={node.sizingH} onChange={(e) => patch({ sizingH: e.target.value as Sizing })}>
              <option value="fixed">고정</option>
              <option value="hug">Hug</option>
              <option value="fill">Fill</option>
            </select>
          </label>
        </div>
      </div>

      <div className="inspector-section">
        <h4>모양</h4>
        <div className="field-grid">
          <NumField label="반경" value={node.style.radius ?? 0} onChange={(v) => patch({ style: { radius: v } })} />
          <NumField
            label="테두리 두께"
            value={node.style.strokeWidth ?? 0}
            onChange={(v) => patch({ style: { strokeWidth: v } })}
          />
        </div>
        <label className="field-wide">
          채움 (변수 바인딩)
          <select
            value={fillIsAlias ? node.style.fill : "__literal"}
            onChange={(e) => patch({ style: { fill: e.target.value === "__literal" ? "#cccccc" : e.target.value } })}
          >
            <option value="__literal">직접 색상</option>
            {allVariables.map((v) => (
              <option key={v} value={v}>
                {v.slice(1)}
              </option>
            ))}
          </select>
        </label>
        {!fillIsAlias && (
          <label className="field-wide">
            채움 HEX
            <input
              value={node.style.fill ?? ""}
              placeholder="#rrggbb"
              onChange={(e) => patch({ style: { fill: e.target.value } })}
            />
          </label>
        )}
      </div>

      {node.text && (
        <div className="inspector-section">
          <h4>텍스트</h4>
          <label className="field-wide">
            내용
            <textarea
              rows={2}
              value={node.text.text}
              onChange={(e) => patch({ text: { text: e.target.value } })}
            />
          </label>
          <div className="field-grid" style={{ marginTop: 6 }}>
            <NumField label="크기" value={node.text.fontSize} onChange={(v) => patch({ text: { fontSize: v } })} />
            <NumField label="굵기" value={node.text.fontWeight} onChange={(v) => patch({ text: { fontWeight: v } })} />
          </div>
          <label className="field-wide">
            색 (변수 바인딩)
            <select
              value={textColorIsAlias ? node.text?.color : "__literal"}
              onChange={(e) => patch({ text: { color: e.target.value === "__literal" ? "#111111" : e.target.value } })}
            >
              <option value="__literal">직접 색상</option>
              {allVariables.map((v) => (
                <option key={v} value={v}>
                  {v.slice(1)}
                </option>
              ))}
            </select>
          </label>
          {!textColorIsAlias && (
            <label className="field-wide">
              색 HEX
              <input
                value={node.text?.color ?? ""}
                placeholder="#rrggbb"
                onChange={(e) => patch({ text: { color: e.target.value } })}
              />
            </label>
          )}
        </div>
      )}

      <div className="inspector-section">
        <h4>Auto-Layout</h4>
        {node.layout ? (
          <>
            <div className="field-grid">
              <label>
                방향
                <select
                  value={node.layout.dir}
                  onChange={(e) => patch({ layout: { dir: e.target.value as "row" | "column" } })}
                >
                  <option value="column">세로 (column)</option>
                  <option value="row">가로 (row)</option>
                </select>
              </label>
              <NumField label="간격" value={node.layout.gap} onChange={(v) => patch({ layout: { gap: v } })} />
            </div>
            <div className="field-grid" style={{ marginTop: 6 }}>
              {(["패딩 상", "패딩 우", "패딩 하", "패딩 좌"] as const).map((label, i) => (
                <NumField
                  key={label}
                  label={label}
                  value={node.layout!.padding[i]}
                  onChange={(v) => {
                    const next = [...node.layout!.padding] as [number, number, number, number];
                    next[i] = v;
                    patch({ layout: { padding: next } });
                  }}
                />
              ))}
            </div>
            <div className="field-grid" style={{ marginTop: 6 }}>
              <label>
                정렬 (교차축)
                <select
                  value={node.layout.align}
                  onChange={(e) => patch({ layout: { align: e.target.value as "start" | "center" | "end" } })}
                >
                  <option value="start">Start</option>
                  <option value="center">Center</option>
                  <option value="end">End</option>
                </select>
              </label>
              <label>
                분포 (주축)
                <select
                  value={node.layout.justify}
                  onChange={(e) =>
                    patch({ layout: { justify: e.target.value as "start" | "center" | "end" | "space-between" } })
                  }
                >
                  <option value="start">Start</option>
                  <option value="center">Center</option>
                  <option value="end">End</option>
                  <option value="space-between">Space Between</option>
                </select>
              </label>
            </div>
          </>
        ) : (
          <button
            onClick={() =>
              patch({ layout: defaultLayout(node.children.length > 0 ? "column" : "row") })
            }
          >
            Auto-Layout 추가
          </button>
        )}
      </div>
    </div>
  );
}
