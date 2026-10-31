import type { Document, StudioNode } from "../model/types";
import type { Paint } from "../model/types";
import { resolveColor } from "../model/variables";

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Attribute values (fills/strokes/colors) can carry arbitrary spec strings;
// escaping blocks breakout like: red" onload="alert(1)
function attr(value: string): string {
  return esc(value);
}

interface SvgOut {
  defs: string[];
  body: string[];
}

let gradientSeq = 0;

function paintFill(paint: Paint | undefined, doc: Document, out: SvgOut): string {
  if (!paint) return "none";
  if (paint.type === "solid") return attr(resolveColor(paint.color, doc) ?? paint.color);
  if (paint.type === "linear") {
    gradientSeq += 1;
    const id = `ds-grad-${gradientSeq}`;
    // CSS angles run clockwise from "to top"; convert to SVG bbox coords.
    const rad = (paint.angle * Math.PI) / 180;
    const dx = Math.sin(rad) / 2;
    const dy = -Math.cos(rad) / 2;
    const stops = paint.stops
      .map((s) => `<stop offset="${Math.round(s.pos * 100)}%" stop-color="${attr(resolveColor(s.color, doc) ?? s.color)}"/>`)
      .join("");
    out.defs.push(
      `<linearGradient id="${id}" x1="${0.5 - dx}" y1="${0.5 - dy}" x2="${0.5 + dx}" y2="${0.5 + dy}">${stops}</linearGradient>`
    );
    return `url(#${id})`;
  }
  return "none";
}

function shapeSvg(n: StudioNode, doc: Document, absX: number, absY: number, out: SvgOut): void {
  const paint = n.style.fills.find((f) => f.type === "solid" || f.type === "linear");
  const fill = paintFill(paint, doc, out);
  const image = n.style.fills.find((f) => f.type === "image") as Extract<Paint, { type: "image" }> | undefined;
  const stroke = resolveColor(n.style.stroke, doc);
  const strokeWidth = n.style.strokeWidth ?? 0;
  const opacity = n.style.opacity ?? 1;

  const shadow = n.style.effects.find((e) => e.type === "drop-shadow");
  let filterAttr = "";
  if (shadow) {
    gradientSeq += 1;
    const id = `ds-shadow-${gradientSeq}`;
    out.defs.push(
      `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="${shadow.x}" dy="${shadow.y}" stdDeviation="${shadow.blur / 2}" flood-color="${attr(resolveColor(shadow.color, doc) ?? shadow.color)}"/></filter>`
    );
    filterAttr = ` filter="url(#${id})"`;
  }

  const w = Math.max(0, n.width);
  const h = Math.max(0, n.height);
  const common = `${filterAttr}${stroke ? ` stroke="${attr(stroke)}" stroke-width="${strokeWidth}"` : ""}`;

  if (n.kind === "ellipse") {
    out.body.push(`<ellipse cx="${absX + w / 2}" cy="${absY + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fill}" opacity="${opacity}"${common}/>`);
  } else {
    out.body.push(`<rect x="${absX}" y="${absY}" width="${w}" height="${h}" rx="${n.style.radius ?? 0}" fill="${fill}" opacity="${opacity}"${common}/>`);
  }
  if (image?.src) {
    out.body.push(`<image href="${attr(image.src)}" x="${absX}" y="${absY}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" opacity="${opacity}"/>`);
  }

  if (n.text) {
    const color = resolveColor(n.text.color, doc) ?? "#000000";
    const baseline = absY + (n.kind === "text" ? n.text.fontSize * 1.0 : h / 2 + n.text.fontSize * 0.35);
    const tx = n.kind === "text" ? absX : absX + 8;
    out.body.push(`<text x="${tx}" y="${baseline}" font-family="Inter, sans-serif" font-size="${n.text.fontSize}" font-weight="${n.text.fontWeight}" fill="${attr(color)}">${esc(n.text.text)}</text>`);
  }
}

export function nodeToSvg(root: StudioNode, doc: Document): string {
  const out: SvgOut = { defs: [], body: [] };
  function walk(n: StudioNode, absX: number, absY: number): void {
    if (!n.visible) return;
    shapeSvg(n, doc, absX, absY, out);
    n.children.forEach((c) => walk(c, absX + c.x, absY + c.y));
  }
  walk(root, 0, 0);
  const w = Math.round(root.width);
  const h = Math.round(root.height);
  const defs = out.defs.length > 0 ? `<defs>${out.defs.join("")}</defs>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs}${out.body.join("\n")}</svg>`;
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
