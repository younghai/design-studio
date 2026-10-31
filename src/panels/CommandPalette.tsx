import React, { useMemo, useState } from "react";
import { useStore } from "../state/store";
import type { DevStatus } from "../model/types";

interface Command {
  id: string;
  label: string;
  run: () => void;
  disabled?: boolean;
}

export default function CommandPalette({ onClose }: { onClose: () => void }): React.ReactElement {
  const { state, dispatch } = useStore();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  const commands = useMemo<Command[]>(() => {
    const has = state.selectedIds.length > 0;
    const setStatus = (status: DevStatus, label: string): Command => ({
      id: `status-${status}`,
      label: `상태: ${label}`,
      disabled: !has,
      run: () => dispatch({ type: "set-status", ids: state.selectedIds, status }),
    });
    return [
      { id: "tool-select", label: "도구: 선택 (V)", run: () => dispatch({ type: "set-tool", tool: "select" }) },
      { id: "tool-frame", label: "도구: 프레임 (F)", run: () => dispatch({ type: "set-tool", tool: "frame" }) },
      { id: "tool-text", label: "도구: 텍스트 (T)", run: () => dispatch({ type: "set-tool", tool: "text" }) },
      { id: "tool-rect", label: "도구: 사각형 (R)", run: () => dispatch({ type: "set-tool", tool: "rect" }) },
      { id: "tool-ellipse", label: "도구: 타원 (O)", run: () => dispatch({ type: "set-tool", tool: "ellipse" }) },
      { id: "mode", label: `모드 전환 (${state.doc.mode === "dark" ? "Dark→Light" : "Light→Dark"})`, run: () => dispatch({ type: "set-mode", mode: state.doc.mode === "dark" ? "light" : "dark" }) },
      { id: "devmode", label: "Dev Mode 전환 (Shift+D)", run: () => dispatch({ type: "set-devmode", on: !state.devMode }) },
      { id: "add-page", label: "새 화면 추가", run: () => dispatch({ type: "add-page" }) },
      { id: "undo", label: "되돌리기 (⌘Z)", disabled: state.undoStack.length === 0, run: () => dispatch({ type: "undo" }) },
      { id: "redo", label: "다시 실행 (⌘⇧Z)", disabled: state.redoStack.length === 0, run: () => dispatch({ type: "redo" }) },
      { id: "fit-all", label: "전체 보기 (Shift+1)", run: () => window.dispatchEvent(new Event("ds-fit-all")) },
      { id: "fit-selection", label: "선택 보기 (Shift+2)", disabled: !has, run: () => window.dispatchEvent(new Event("ds-fit-selection")) },
      { id: "zoom-100", label: "줌 100% (Shift+0)", run: () => dispatch({ type: "set-viewport", zoom: 1, panX: 40, panY: 40 }) },
      setStatus("design", "설계중"),
      setStatus("ready", "개발준비"),
      setStatus("done", "완료"),
      { id: "dup", label: "선택 복제 (⌘D)", disabled: !has, run: () => dispatch({ type: "duplicate-set", ids: state.selectedIds }) },
      { id: "del", label: "선택 삭제 (Del)", disabled: !has, run: () => dispatch({ type: "delete-set", ids: state.selectedIds }) },
    ];
  }, [dispatch, state]);

  const filtered = commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));
  const active = filtered.slice(0, 12);

  function runAt(i: number): void {
    const cmd = active[i];
    if (cmd && !cmd.disabled) {
      cmd.run();
      onClose();
    }
  }

  return (
    <div className="variables-overlay" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="명령 검색…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, active.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              runAt(cursor);
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
        />
        <div className="palette-list" role="listbox">
          {active.map((c, i) => (
            <button
              key={c.id}
              className={`palette-item${i === cursor ? " active" : ""}`}
              disabled={c.disabled}
              onMouseEnter={() => setCursor(i)}
              onClick={() => runAt(i)}
            >
              {c.label}
            </button>
          ))}
          {active.length === 0 && <p className="palette-empty">일치하는 명령이 없습니다</p>}
        </div>
      </div>
    </div>
  );
}
