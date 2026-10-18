import React, { useRef } from "react";
import { useStore } from "../state/store";
import type { Tool } from "../state/store";
import { exportDocument, importDocumentFile, readSpecFile } from "../io/documentIo";
import { specToDocument } from "../model/fixtures";
import "./panels.css";

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: "select", label: "선택", key: "V" },
  { id: "frame", label: "프레임", key: "F" },
  { id: "text", label: "텍스트", key: "T" },
  { id: "rect", label: "사각형", key: "R" },
  { id: "ellipse", label: "타원", key: "O" },
];

interface ToolbarProps {
  variablesOpen: boolean;
  onToggleVariables: () => void;
}

export default function Toolbar({ variablesOpen, onToggleVariables }: ToolbarProps): React.ReactElement {
  const { state, dispatch } = useStore();
  const specInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  function toast(message: string): void {
    dispatch({ type: "toast", message });
    window.setTimeout(() => dispatch({ type: "toast", message: null }), 2600);
  }

  return (
    <div className="toolbar">
      <span className="title">DESIGN Studio</span>
      <div className="toolbar-group">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={state.tool === t.id ? "active" : ""}
            title={`${t.label} (${t.key})`}
            onClick={() => dispatch({ type: "set-tool", tool: t.id })}
          >
            {t.key}
          </button>
        ))}
      </div>
      <div className="toolbar-group">
        <button
          className={state.doc.mode === "dark" ? "active" : ""}
          onClick={() => dispatch({ type: "set-mode", mode: state.doc.mode === "dark" ? "light" : "dark" })}
        >
          {state.doc.mode === "dark" ? "Dark" : "Light"}
        </button>
        <button className={variablesOpen ? "active" : ""} onClick={onToggleVariables}>
          변수
        </button>
        <button
          className={state.devMode ? "active" : ""}
          title="Dev Mode (Shift+D)"
          onClick={() => dispatch({ type: "set-devmode", on: !state.devMode })}
        >
          {"</>"}
        </button>
      </div>
      <div className="toolbar-group">
        <button onClick={() => dispatch({ type: "set-viewport", zoom: Math.max(0.1, state.zoom / 1.2) })}>-</button>
        <span className="zoom-label">{Math.round(state.zoom * 100)}%</span>
        <button onClick={() => dispatch({ type: "set-viewport", zoom: Math.min(4, state.zoom * 1.2) })}>+</button>
        <button onClick={() => dispatch({ type: "set-viewport", zoom: 1, panX: 40, panY: 40 })}>100%</button>
      </div>
      <div className="spacer" />
      <div className="toolbar-group">
        <button title="NodeSpec JSON 적용" onClick={() => specInputRef.current?.click()}>
          Spec 적용
        </button>
        <button onClick={() => exportDocument(state.doc)}>내보내기</button>
        <button onClick={() => docInputRef.current?.click()}>가져오기</button>
      </div>
      <input
        ref={specInputRef}
        type="file"
        accept="application/json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            const spec = await readSpecFile(file);
            dispatch({ type: "load-document", doc: specToDocument(spec as never, state.doc.mode) });
            toast(`스펙 적용 완료: ${file.name} (⌘Z로 되돌리기)`);
          } catch (err) {
            toast(`스펙 거부: ${(err as Error).message}`);
          }
        }}
      />
      <input
        ref={docInputRef}
        type="file"
        accept="application/json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            const doc = await importDocumentFile(file);
            dispatch({ type: "load-document", doc });
            toast(`문서 가져오기 완료: ${doc.name}`);
          } catch (err) {
            toast(`가져오기 거부: ${(err as Error).message}`);
          }
        }}
      />
    </div>
  );
}
