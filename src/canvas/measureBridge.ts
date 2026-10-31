import { setTextMeasurer } from "../model/types";

/**
 * Real text metrics via canvas 2D. The model stays DOM-free; the app injects
 * this at mount. Returns after document.fonts.ready resolved so Inter is
 * loaded before first measure.
 */
export function installTextMeasurer(): Promise<void> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve();
  const apply = (): void => {
    setTextMeasurer((text, fontSize, fontWeight) => {
      ctx.font = `${fontWeight} ${fontSize}px Inter, system-ui, sans-serif`;
      const m = ctx.measureText(text);
      return { w: Math.ceil(m.width + 8), h: Math.ceil(fontSize * 1.3 + 4) };
    });
  };
  apply();
  if (document.fonts?.ready) {
    return document.fonts.ready.then(apply);
  }
  return Promise.resolve();
}
