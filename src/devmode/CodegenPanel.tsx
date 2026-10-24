import React, { useMemo, useState } from "react";
import { findNode, useStore } from "../state/store";
import { relayoutTree } from "../model/relayout";
import { toCompose, toCss, toReact, toSwiftUI, toTailwind } from "./codegen";
import "../panels/panels.css";

type Target = "react" | "css" | "tailwind" | "swiftui" | "compose";

const TABS: { id: Target; label: string }[] = [
  { id: "react", label: "React" },
  { id: "css", label: "CSS" },
  { id: "tailwind", label: "Tailwind" },
  { id: "swiftui", label: "SwiftUI" },
  { id: "compose", label: "Compose" },
];

export default function CodegenPanel(): React.ReactElement {
  const { state, dispatch } = useStore();
  const [target, setTarget] = useState<Target>("react");
  const [copied, setCopied] = useState(false);

  const placed = useMemo(() => relayoutTree(state.doc.root), [state.doc.root]);
  const hit = state.selectedId ? findNode(placed, state.selectedId) : null;
  const selected = hit?.node ?? placed;

  const code = useMemo(() => {
    if (target === "react") return toReact(selected, state.doc);
    if (target === "css") return toCss(selected, state.doc);
    if (target === "tailwind") return toTailwind(selected, state.doc);
    if (target === "swiftui") return toSwiftUI(selected, state.doc);
    return toCompose(selected, state.doc);
  }, [selected, state.doc, target]);

  function copy(): void {
    navigator.clipboard.writeText(code).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => dispatch({ type: "toast", message: "클립보드 복사 실패" })
    );
  }

  return (
    <div className="inspector-panel">
      <div className="panel-header">Dev Mode — {selected.name}</div>
      <div className="inspector-section">
        <div className="toolbar-group">
          {TABS.map((t) => (
            <button key={t.id} className={target === t.id ? "active" : ""} onClick={() => setTarget(t.id)}>
              {t.label}
            </button>
          ))}
          <button onClick={copy}>{copied ? "복사됨" : "복사"}</button>
        </div>
        <pre
          style={{
            margin: "8px 0 0",
            padding: 8,
            background: "var(--ds-canvas-bg)",
            borderRadius: 6,
            fontSize: 11,
            overflow: "auto",
            maxHeight: "70vh",
            whiteSpace: "pre",
          }}
        >
          {code}
        </pre>
      </div>
    </div>
  );
}
