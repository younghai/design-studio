/*
 * 골든 출력 형태 (easeui-agent-console 스펙 최상위 프레임 기준):
 * - React: 루트 프레임이 `export function EaseuiAgentFirstSpecConsole()`이 되고, 각 자식 프레임은
 *   중첩 JSX <div style={{...}}>로 재귀 내려간다. 변수 별칭은 var(--easeui-bg-panel) 문자열로 남는다.
 * - CSS: 노드당 `.easeui-agent-first-spec-console .top-header-bar { position: absolute; ... }` 규칙이
 *   깊이 순서로 나열되고, 파일 앞에 :root { --easeui-bg-panel: #161b22; ... } 변수 블록이 온다.
 * - Tailwind: 노드당 `absolute left-[28px] top-[28px] w-[1376px] h-[68px] bg-[var(--easeui-bg-panel)] ...`
 *   형태의 클래스 문자열이 한 줄로 나온다.
 */
import type { Document, StudioNode } from "../model/types";
import { resolveColor } from "../model/variables";

function pascal(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

function kebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .replace(/^-|-$/g, "");
}

function cssVarName(alias: string): string {
  return alias.replace(/^\$/, "").replace(/\./g, "-");
}

function colorValue(value: string | undefined, doc: Document): string {
  if (value === undefined) return "transparent";
  if (value.startsWith("$")) return `var(--${cssVarName(value)})`;
  return resolveColor(value, doc) ?? value;
}

function indent(depth: number): string {
  return "  ".repeat(depth);
}

export function variablesBlock(doc: Document): string {
  const lines: string[] = [];
  doc.collections.forEach((c) => {
    Object.entries(c.variables).forEach(([path, value]) => {
      const v = doc.mode === "light" ? value.light : value.dark;
      lines.push(`  --${c.name}-${path.replace(/\./g, "-")}: ${v};`);
    });
  });
  return `:root {\n${lines.join("\n")}\n}`;
}

export function toReact(root: StudioNode, doc: Document): string {
  function styleObject(n: StudioNode): string {
    const entries: string[] = [
      "position: \"absolute\"",
      `left: ${Math.round(n.x)}`,
      `top: ${Math.round(n.y)}`,
      `width: ${Math.round(n.width)}`,
      `height: ${Math.round(n.height)}`,
    ];
    if (n.style.fill !== undefined) entries.push(`background: "${colorValue(n.style.fill, doc)}"`);
    if (n.style.radius) entries.push(`borderRadius: ${n.style.radius === 999 ? '"50%"' : n.style.radius}`);
    if (n.style.stroke && n.style.strokeWidth) {
      entries.push(`border: "${n.style.strokeWidth}px solid ${colorValue(n.style.stroke, doc)}"`);
    }
    return `{{ ${entries.join(", ")} }}`;
  }

  function element(n: StudioNode, depth: number): string {
    const tag = `${indent(depth)}<div style=${styleObject(n)}>`;
    const label = n.name.replace(/</g, "&lt;");
    if (n.text) {
      const textStyle = n.kind === "text"
        ? `font-size: ${n.text.fontSize}; font-weight: ${n.text.fontWeight}; color: ${colorValue(n.text.color, doc)}`
        : "";
      return [
        `${tag}`,
        `${indent(depth + 1)}<span${textStyle ? ` style={{ fontSize: ${n.text.fontSize}, fontWeight: ${n.text.fontWeight}, color: "${colorValue(n.text.color, doc)}" }}` : ""}>`,
        `${indent(depth + 2)}${n.text.text}`,
        `${indent(depth + 1)}</span>`,
        ...n.children.map((c) => element(c, depth + 1)),
        `${indent(depth)}</div><!-- ${label} -->`,
      ].join("\n");
    }
    if (n.children.length === 0) {
      return `${tag}</div><!-- ${label} -->`;
    }
    return [tag, ...n.children.map((c) => element(c, depth + 1)), `${indent(depth)}</div><!-- ${label} -->`].join("\n");
  }

  const componentName = pascal(root.name) || "Design";
  return [
    `export function ${componentName}() {`,
    `  return (`,
    element(root, 2),
    `  );`,
    `}`,
  ].join("\n");
}

export function toCss(root: StudioNode, doc: Document): string {
  const rules: string[] = [];
  function rule(n: StudioNode, parentSlug: string | null): void {
    const slug = kebab(n.name) || "node";
    const selector = parentSlug ? `.${parentSlug} .${slug}` : `.${slug}`;
    const lines = [
      "  position: absolute;",
      `  left: ${Math.round(n.x)}px;`,
      `  top: ${Math.round(n.y)}px;`,
      `  width: ${Math.round(n.width)}px;`,
  `  height: ${Math.round(n.height)}px;`,
    ];
    if (n.style.fill !== undefined) lines.push(`  background: ${colorValue(n.style.fill, doc)};`);
    if (n.style.radius) lines.push(`  border-radius: ${n.style.radius === 999 ? "50%" : `${n.style.radius}px`};`);
    if (n.style.stroke && n.style.strokeWidth) {
      lines.push(`  border: ${n.style.strokeWidth}px solid ${colorValue(n.style.stroke, doc)};`);
    }
    rules.push(`${selector} {\n${lines.join("\n")}\n}`);
    n.children.forEach((c) => rule(c, slug));
  }
  rule(root, null);
  return [variablesBlock(doc), ...rules].join("\n\n");
}

export function toTailwind(root: StudioNode, doc: Document): string {
  function classes(n: StudioNode): string {
    const parts = [
      "absolute",
      `left-[${Math.round(n.x)}px]`,
      `top-[${Math.round(n.y)}px]`,
      `w-[${Math.round(n.width)}px]`,
      `h-[${Math.round(n.height)}px]`,
    ];
    if (n.style.fill !== undefined) parts.push(`bg-[${colorValue(n.style.fill, doc)}]`);
    if (n.style.radius) parts.push(n.style.radius === 999 ? "rounded-full" : `rounded-[${n.style.radius}px]`);
    if (n.style.stroke && n.style.strokeWidth) {
      parts.push(`border-[${n.style.strokeWidth}px] border-[${colorValue(n.style.stroke, doc)}]`);
    }
    return parts.join(" ");
  }
  function line(n: StudioNode, depth: number): string {
    const cls = classes(n);
    const head = `${indent(depth)}<!-- ${n.name} -->`;
    const open = `${indent(depth)}<div class="${cls}">`;
    if (n.text) {
      const textCls = `text-[${Math.round(n.text.fontSize)}px] font-[${n.text.fontWeight}]`;
      const color = n.text.color ? ` text-[${colorValue(n.text.color, doc)}]` : "";
      return [
        head,
        open,
        `${indent(depth + 1)}<span class="${textCls}${color}">${n.text.text}</span>`,
        `${indent(depth)}</div>`,
      ].join("\n");
    }
    if (n.children.length === 0) {
      return `${head}\n${open}</div>`;
    }
    return [head, open, ...n.children.map((c) => line(c, depth + 1)), `${indent(depth)}</div>`].join("\n");
  }
  return [variablesBlock(doc), "", line(root, 0)].join("\n");
}
