import React, { useRef } from "react";
import { findInDoc, useStore } from "../state/store";
import type { NodePatch } from "../state/store";
import { isAlias } from "../model/variables";
import { defaultLayout } from "../model/types";
import type { DevStatus } from "../model/types";
import { relayoutTree } from "../model/relayout";
import "./panels.css";

// Label drag-scrubs (1px, Shift 10px) and Enter evaluates + - * / math like
// "120+40". Blur commits the raw value when it parses.
function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}): React.ReactElement {
  const dragRef = useRef<{ startX: number; startValue: number } | null>(null);

  function commit(raw: string): void {
    const trimmed = raw.trim();
    const m = trimmed.match(/^(-?[\d.]+)\s*([+\-*/])\s*(-?[\d.]+)$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[3]);
      const op = m[2];
      const out = op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : b === 0 ? NaN : a / b;
      if (Number.isFinite(out)) {
        onChange(Math.round(out * 100) / 100);
        return;
      }
    }
    const n = Number(trimmed);
    if (Number.isFinite(n)) onChange(n);
  }

  return (
    <label>
      <span
        className="scrub-label"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          dragRef.current = { startX: e.clientX, startValue: value };
        }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (!d) return;
          const step = e.shiftKey ? 10 : 1;
          const next = Math.round((d.startValue + (e.clientX - d.startX) * step) * 100) / 100;
          onChange(next);
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
      >
        {label}
      </span>
      <input
        type="text"
        defaultValue={String(Math.round(value * 100) / 100)}
        key={`${label}-${value}`}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        onBlur={(e) => commit(e.target.value)}
      />
    </label>
  );
}

const STATUS_OPTIONS: { id: DevStatus; label: string }[] = [
  { id: "design", label: "설계중" },
  { id: "ready", label: "개발준비" },
  { id: "done", label: "완료" },
];

export default function Inspector(): React.ReactElement {
  const { state, dispatch } = useStore();

  function computeRects(ids: string[]): Record<string, { x: number; y: number; w: number; h: number }> {
    const rects: Record<string, { x: number; y: number; w: number; h: number }> = {};
    const wanted = new Set(ids);
    for (const page of state.doc.pages) {
      const placed = relayoutTree(page);
      (function walk(n: StudioNodeLike, ax: number, ay: number): void {
        for (const c of n.children) {
          const cx = ax + c.x;
          const cy = ay + c.y;
          if (wanted.has(c.id)) rects[c.id] = { x: cx, y: cy, w: c.width, h: c.height };
          walk(c, cx, cy);
        }
      })(placed, page.x, page.y);
      if (wanted.has(placed.id)) rects[placed.id] = { x: page.x, y: page.y, w: placed.width, h: placed.height };
    }
    return rects;
  }

  if (state.selectedIds.length > 1) {
    const alignBtns: { mode: "left" | "center" | "right" | "top" | "middle" | "bottom" | "h" | "v"; label: string }[] = [
      { mode: "left", label: "좌" },
      { mode: "center", label: "가운데" },
      { mode: "right", label: "우" },
      { mode: "top", label: "상" },
      { mode: "middle", label: "세로중앙" },
      { mode: "bottom", label: "하" },
      { mode: "h", label: "수직분배" },
      { mode: "v", label: "수평분배" },
    ];
    return (
      <div className="inspector-panel">
        <div className="panel-header">인스펙터</div>
        <div className="inspector-section">
          <p style={{ margin: 0 }}>{state.selectedIds.length}개 노드가 선택되었습니다</p>
          <p style={{ color: "var(--ds-text-dim)", margin: "4px 0 0" }}>
            속성 편집은 단일 선택에서만 가능합니다.
          </p>
          <h4 style={{ margin: "12px 0 4px" }}>정렬</h4>
          <div className="align-grid">
            {alignBtns.map((b) => (
              <button
                key={b.mode}
                disabled={b.mode === "h" || b.mode === "v" ? state.selectedIds.length < 3 : false}
                onClick={() => dispatch({ type: "align", ids: state.selectedIds, mode: b.mode, rects: computeRects(state.selectedIds) })}
              >
                {b.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <button onClick={() => dispatch({ type: "duplicate-set", ids: state.selectedIds })}>복제 (⌘D)</button>
            <button onClick={() => dispatch({ type: "delete-set", ids: state.selectedIds })}>삭제 (Del)</button>
          </div>
        </div>
      </div>
    );
  }

  const hit = state.primaryId ? findInDoc(state.doc, state.primaryId) : null;
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
  const isPage = hit.parent === null;
  const allVariables = state.doc.collections.flatMap((c) => Object.keys(c.variables).map((p) => `$${c.name}.${p}`));
  const firstPaint = node.style.fills[0];
  const solidFill = firstPaint?.type === "solid" ? firstPaint.color : undefined;
  const fillIsAlias = isAlias(solidFill);
  const shadow = node.style.effects.find((e) => e.type === "drop-shadow");
  const textColorIsAlias = isAlias(node.text?.color);

  function patch(patchObj: NodePatch): void {
    dispatch({ type: "set-props", id: node.id, patch: patchObj });
  }

  return (
    <div className="inspector-panel">
      <div className="panel-header">인스펙터{isPage ? " — 화면" : ""}</div>

      <div className="inspector-section">
        <h4>노드</h4>
        <label className="field-wide">
          이름
          <input value={node.name} onChange={(e) => patch({ name: e.target.value })} />
        </label>
        <div className="field-grid" style={{ marginTop: 6 }}>
          <label>
            개발 상태
            <select value={node.devStatus} onChange={(e) => patch({ devStatus: e.target.value as DevStatus })}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button onClick={() => dispatch({ type: "duplicate", id: node.id })}>복제 (⌘D)</button>
          {isPage ? (
            <button
              disabled={state.doc.pages.length <= 1}
              onClick={() => dispatch({ type: "delete-page", pageIndex: hit.pageIndex })}
            >
              화면 삭제
            </button>
          ) : (
            <button onClick={() => dispatch({ type: "delete", id: node.id })}>삭제 (Del)</button>
          )}
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
            <select value={node.sizingW} onChange={(e) => patch({ sizingW: e.target.value as never })}>
              <option value="fixed">고정</option>
              <option value="hug">Hug</option>
              <option value="fill">Fill</option>
            </select>
          </label>
          <label>
            H 크기
            <select value={node.sizingH} onChange={(e) => patch({ sizingH: e.target.value as never })}>
              <option value="fixed">고정</option>
              <option value="hug">Hug</option>
              <option value="fill">Fill</option>
            </select>
          </label>
        </div>
      </div>

      <div className="inspector-section">
        <h4>채움</h4>
        {!firstPaint && (
          <button onClick={() => patch({ style: { fills: [{ type: "solid", color: "#cccccc" }] } })}>
            단색 추가
          </button>
        )}
        {firstPaint?.type === "solid" && (
          <>
            <label className="field-wide">
              색 (변수 바인딩)
              <select
                value={fillIsAlias ? solidFill : "__literal"}
                onChange={(e) =>
                  patch({ style: { fills: [{ type: "solid", color: e.target.value === "__literal" ? "#cccccc" : e.target.value }] } })
                }
              >
                <option value="__literal">직접 색상</option>
                {allVariables.map((v) => (
                  <option key={v} value={v}>{v.slice(1)}</option>
                ))}
              </select>
            </label>
            {!fillIsAlias && (
              <label className="field-wide">
                HEX
                <input
                  value={solidFill ?? ""}
                  placeholder="#rrggbb"
                  onChange={(e) => patch({ style: { fills: [{ type: "solid", color: e.target.value }] } })}
                />
              </label>
            )}
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button
                title="단색을 그라데이션으로"
                onClick={() =>
                  patch({
                    style: {
                      fills: [
                        { type: "linear", angle: 90, stops: [
                          { color: solidFill ?? "#cccccc", pos: 0 },
                          { color: "#000000", pos: 1 },
                        ] },
                      ],
                    },
                  })
                }
              >
                그라데이션으로
              </button>
              <button
                title="이미지 채움 (URL 또는 data URI)"
                onClick={() => patch({ style: { fills: [{ type: "image", src: "" }] } })}
              >
                이미지로
              </button>
            </div>
          </>
        )}
        {firstPaint?.type === "linear" && (
          <>
            <div className="field-grid">
              <NumField
                label="각도"
                value={firstPaint.angle}
                onChange={(v) => patch({ style: { fills: [{ ...firstPaint, angle: v }] } })}
              />
            </div>
            <div className="field-grid" style={{ marginTop: 6 }}>
              {firstPaint.stops.map((s, i) => (
                <label key={i}>
                  정지점 {i + 1} (%)
                  <input
                    type="text"
                    defaultValue={`${s.color} @ ${Math.round(s.pos * 100)}`}
                    key={`${i}-${s.color}-${s.pos}`}
                    onBlur={(e) => {
                      const m = e.target.value.match(/^(#?\S+)\s*@\s*([\d.]+)%?$/);
                      if (m) {
                        const stops = firstPaint.stops.map((st, j) =>
                          j === i ? { ...st, color: m[1].startsWith("#") ? m[1] : `#${m[1]}`, pos: Math.min(1, Math.max(0, Number(m[2]) / 100)) } : st
                        );
                        patch({ style: { fills: [{ ...firstPaint, stops }] } });
                      }
                    }}
                  />
                </label>
              ))}
            </div>
            <button style={{ marginTop: 6 }} onClick={() => patch({ style: { fills: [{ type: "solid", color: firstPaint.stops[0]?.color ?? "#cccccc" }] } })}>
              단색으로 되돌리기
            </button>
          </>
        )}
        {firstPaint?.type === "image" && (
          <label className="field-wide">
            이미지 src (URL / data URI)
            <input
              value={firstPaint.src}
              placeholder="https://… 또는 data:image/png;base64,…"
              onChange={(e) => patch({ style: { fills: [{ type: "image", src: e.target.value }] } })}
            />
          </label>
        )}
      </div>

      <div className="inspector-section">
        <h4>효과 (드롭 섀도)</h4>
        {shadow ? (
          <>
            <div className="field-grid">
              <NumField label="X" value={shadow.x} onChange={(v) => patch({ style: { effects: [{ ...shadow, x: v }] } })} />
              <NumField label="Y" value={shadow.y} onChange={(v) => patch({ style: { effects: [{ ...shadow, y: v }] } })} />
              <NumField label="블러" value={shadow.blur} onChange={(v) => patch({ style: { effects: [{ ...shadow, blur: v }] } })} />
              <label>
                색
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(shadow.color) ? shadow.color : "#000000"}
                  onChange={(e) => patch({ style: { effects: [{ ...shadow, color: e.target.value }] } })}
                />
              </label>
            </div>
            <button style={{ marginTop: 6 }} onClick={() => patch({ style: { effects: [] } })}>
              섀도 제거
            </button>
          </>
        ) : (
          <button
            onClick={() =>
              patch({ style: { effects: [{ type: "drop-shadow", x: 0, y: 8, blur: 24, color: "#00000080" }] } })
            }
          >
            섀도 추가
          </button>
        )}
      </div>

      <div className="inspector-section">
        <h4>모양</h4>
        <div className="field-grid">
          <NumField label="반경" value={node.style.radius ?? 0} onChange={(v) => patch({ style: { radius: v } })} />
          <NumField label="테두리 두께" value={node.style.strokeWidth ?? 0} onChange={(v) => patch({ style: { strokeWidth: v } })} />
        </div>
        <label className="field-wide">
          테두리 색 (변수 바인딩)
          <select
            value={isAlias(node.style.stroke) ? node.style.stroke : "__literal"}
            onChange={(e) => patch({ style: { stroke: e.target.value === "__literal" ? "#cccccc" : e.target.value } })}
          >
            <option value="__literal">직접 색상</option>
            {allVariables.map((v) => (
              <option key={v} value={v}>{v.slice(1)}</option>
            ))}
          </select>
        </label>
      </div>

      {node.text && (
        <div className="inspector-section">
          <h4>텍스트</h4>
          <label className="field-wide">
            내용
            <textarea rows={2} value={node.text.text} onChange={(e) => patch({ text: { text: e.target.value } })} />
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
                <option key={v} value={v}>{v.slice(1)}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="inspector-section">
        <h4>Auto-Layout</h4>
        {node.layout ? (
          <>
            <div className="field-grid">
              <label>
                방향
                <select value={node.layout.dir} onChange={(e) => patch({ layout: { dir: e.target.value as "row" | "column" } })}>
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
                <select value={node.layout.align} onChange={(e) => patch({ layout: { align: e.target.value as "start" | "center" | "end" } })}>
                  <option value="start">Start</option>
                  <option value="center">Center</option>
                  <option value="end">End</option>
                </select>
              </label>
              <label>
                분포 (주축)
                <select value={node.layout.justify} onChange={(e) => patch({ layout: { justify: e.target.value as "start" | "center" | "end" | "space-between" } })}>
                  <option value="start">Start</option>
                  <option value="center">Center</option>
                  <option value="end">End</option>
                  <option value="space-between">Space Between</option>
                </select>
              </label>
            </div>
          </>
        ) : (
          <button onClick={() => patch({ layout: defaultLayout(node.children.length > 0 ? "column" : "row") })}>
            Auto-Layout 추가
          </button>
        )}
      </div>
    </div>
  );
}

type StudioNodeLike = { id: string; children: StudioNodeLike[]; x: number; y: number; width: number; height: number };
