import React from "react";
import { useStore } from "../state/store";
import "./panels.css";

interface VariablesPanelProps {
  onClose: () => void;
}

export default function VariablesPanel({ onClose }: VariablesPanelProps): React.ReactElement {
  const { state, dispatch } = useStore();

  return (
    <div className="variables-overlay" onClick={onClose}>
      <div className="variables-modal" onClick={(e) => e.stopPropagation()}>
        <h3>변수 — 디자인 토큰</h3>
        <div className="toolbar-group">
          <button
            className={state.doc.mode === "light" ? "active" : ""}
            onClick={() => dispatch({ type: "set-mode", mode: "light" })}
          >
            Light
          </button>
          <button
            className={state.doc.mode === "dark" ? "active" : ""}
            onClick={() => dispatch({ type: "set-mode", mode: "dark" })}
          >
            Dark
          </button>
        </div>
        {state.doc.collections.map((c) => (
          <div key={c.id}>
            <div className="collection-name">{c.name}</div>
            {Object.entries(c.variables).map(([path, value]) => (
              <div className="variable-row" key={path}>
                <span className="path">${c.name}.{path}</span>
                <label>
                  Light
                  <input
                    type="color"
                    value={value.light}
                    onChange={(e) =>
                      dispatch({
                        type: "set-variable",
                        collection: c.name,
                        path,
                        mode: "light",
                        value: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Dark
                  <input
                    type="color"
                    value={value.dark}
                    onChange={(e) =>
                      dispatch({
                        type: "set-variable",
                        collection: c.name,
                        path,
                        mode: "dark",
                        value: e.target.value,
                      })
                    }
                  />
                </label>
              </div>
            ))}
          </div>
        ))}
        <div className="modal-actions">
          <button onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
