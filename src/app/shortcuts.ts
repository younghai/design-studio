import { useEffect } from "react";
import { useStore } from "../state/store";
import type { Tool } from "../state/store";

const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  f: "frame",
  t: "text",
  r: "rect",
  o: "ellipse",
};

export function useShortcuts(): void {
  const { state, dispatch } = useStore();
  const hasSelection = state.selectedIds.length > 0;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const target = e.target as HTMLElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        return;
      }
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
        return;
      }
      if (meta && e.key.toLowerCase() === "a") {
        e.preventDefault();
        dispatch({ type: "select-many", ids: state.doc.root.children.map((c) => c.id) });
        return;
      }
      if (meta && e.key.toLowerCase() === "d" && hasSelection) {
        e.preventDefault();
        dispatch({ type: "duplicate-set", ids: state.selectedIds });
        return;
      }
      if (meta && e.key.toLowerCase() === "c" && hasSelection) {
        e.preventDefault();
        dispatch({ type: "copy" });
        return;
      }
      if (meta && e.key.toLowerCase() === "x" && hasSelection) {
        e.preventDefault();
        dispatch({ type: "copy" });
        dispatch({ type: "delete-set", ids: state.selectedIds });
        return;
      }
      if (meta && e.key.toLowerCase() === "v") {
        e.preventDefault();
        dispatch({ type: "paste" });
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && hasSelection) {
        e.preventDefault();
        dispatch({ type: "delete-set", ids: state.selectedIds });
        return;
      }
      if (e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        dispatch({ type: "set-devmode", on: !state.devMode });
        return;
      }
      if (!meta && !e.shiftKey && !e.altKey) {
        const tool = TOOL_KEYS[e.key.toLowerCase()];
        if (tool) dispatch({ type: "set-tool", tool });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, hasSelection, state.selectedIds, state.devMode, state.doc.root]);
}
