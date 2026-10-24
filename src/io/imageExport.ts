import type { Document, StudioNode } from "../model/types";
import { resolveColor } from "../model/variables";

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Attribute values (fill/stroke/color) can carry arbitrary spec strings;
// escaping blocks breakout like: red" onload="alert(1)
function attr(value: string): string {
  return esc(value);
}

function shapeSvg(n: StudioNode, doc: Document, absX: number, absY: number): string {
  const fill = resolveColor(n.style.fill, doc) ?? "none";
  const stroke = resolveColor(n.style.stroke, doc);
  const strokeWidth = n.style.strokeWidth ?? 0;
  const opacity = n.style.opacity ?? 1;
  const common = `opacity="${opacity}"${stroke ? ` stroke="${attr(stroke)}" stroke-width="${strokeWidth}"` : ""}`;
  const w = Math.max(0, n.width);
  const h = Math.max(0, n.height);

  let shape: string;
  if (n.kind === "ellipse") {
    shape = `<ellipse cx="${absX + w / 2}" cy="${absY + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${attr(fill)}" ${common}/>`;
  } else {
    shape = `<rect x="${absX}" y="${absY}" width="${w}" height="${h}" rx="${n.style.radius ?? 0}" fill="${attr(fill)}" ${common}/>`;
  }

  let textSvg = "";
  if (n.text) {
    const color = resolveColor(n.text.color, doc) ?? "#000000";
    const baseline = absY + (n.kind === "text" ? n.text.fontSize * 1.0 : h / 2 + n.text.fontSize * 0.35);
    const tx = n.kind === "text" ? absX : absX + 8;
    textSvg = `<text x="${tx}" y="${baseline}" font-family="Inter, sans-serif" font-size="${n.text.fontSize}" font-weight="${n.text.fontWeight}" fill="${attr(color)}">${esc(n.text.text)}</text>`;
  }
  return shape + textSvg;
}

export function nodeToSvg(root: StudioNode, doc: Document): string {
  const parts: string[] = [];
  function walk(n: StudioNode, absX: number, absY: number): void {
    if (!n.visible) return;
    parts.push(shapeSvg(n, doc, absX, absY));
    n.children.forEach((c) => walk(c, absX + c.x, absY + c.y));
  }
  walk(root, 0, 0);
  const w = Math.round(root.width);
  const h = Math.round(root.height);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${parts.join("\n")}</svg>`;
}

function download(href: string, filename: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
}

export function downloadSvg(svg: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  download(url, filename);
  URL.revokeObjectURL(url);
}

export async function downloadPng(svg: string, filename: string, scale = 2): Promise<void> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG 래스터화 실패"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2D 컨텍스트를 얻을 수 없습니다");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG 변환 실패");
    const pngUrl = URL.createObjectURL(blob);
    download(pngUrl, filename);
    URL.revokeObjectURL(pngUrl);
  } finally {
    URL.revokeObjectURL(url);
  }
}
