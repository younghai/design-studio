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
      if (meta && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (state.selectedId) dispatch({ type: "duplicate", id: state.selectedId });
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && state.selectedId) {
        e.preventDefault();
        dispatch({ type: "delete", id: state.selectedId });
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
  }, [dispatch, state.selectedId, state.devMode]);
}
