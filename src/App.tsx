import React, { useEffect, useRef, useState } from "react";
import { StoreProvider, useStore } from "./state/store";
import { loadLocal, saveLocal } from "./io/documentIo";
import Toolbar from "./panels/Toolbar";
import LayersPanel from "./panels/LayersPanel";
import Inspector from "./panels/Inspector";
import VariablesPanel from "./panels/VariablesPanel";
import CanvasView from "./canvas/CanvasView";
import CodegenPanel from "./devmode/CodegenPanel";
import { useShortcuts } from "./app/shortcuts";
import ErrorBoundary from "./app/ErrorBoundary";

function AppInner(): React.ReactElement {
  const { state, dispatch } = useStore();
  const [variablesOpen, setVariablesOpen] = useState(false);
  const restoredRef = useRef(false);
  useShortcuts();

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const saved = loadLocal();
    if (saved) {
      dispatch({ type: "restore", doc: saved });
      if (!localStorage.getItem("design-studio-backup-hint")) {
        localStorage.setItem("design-studio-backup-hint", "1");
        dispatch({
          type: "toast",
          message: "문서는 이 브라우저에만 저장됩니다. '내보내기'로 JSON 백업을 만들어 보세요.",
        });
        window.setTimeout(() => dispatch({ type: "toast", message: null }), 6000);
      }
    }
  }, [dispatch]);

  useEffect(() => {
    const timer = window.setTimeout(() => saveLocal(state.doc), 500);
    return () => window.clearTimeout(timer);
  }, [state.doc]);

  return (
    <div className="app-shell">
      <Toolbar variablesOpen={variablesOpen} onToggleVariables={() => setVariablesOpen((v) => !v)} />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <LayersPanel />
        <CanvasView />
        {state.devMode ? <CodegenPanel /> : <Inspector />}
      </div>
      {variablesOpen && <VariablesPanel onClose={() => setVariablesOpen(false)} />}
      {state.toast && <div className="toast">{state.toast}</div>}
    </div>
  );
}

export default function App(): React.ReactElement {
  return (
    <ErrorBoundary>
      <StoreProvider>
        <AppInner />
      </StoreProvider>
    </ErrorBoundary>
  );
}
