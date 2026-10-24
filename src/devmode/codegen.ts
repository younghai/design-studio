/*
 * 골든 출력 형태 (easeui-agent-console 스펙 최상위 프레임 기준):
 * - React: 루트 프레임이 `export function EaseuiAgentFirstSpecConsole()`이 되고, 각 자식 프레임은
 *   중첩 JSX <div style={{...}}>로 재귀 내려간다. 변수 별칭은 var(--easeui-bg-panel) 문자열로 남는다.
 * - CSS: 노드당 `.easeui-agent-first-spec-console .top-header-bar { position: absolute; ... }` 규칙이
 *   깊이 순서로 나열되고, 파일 앞에 :root { --easeui-bg-panel: #161b22; ... } 변수 블록이 온다.
 * - Tailwind: 노드당 `absolute left-[28px] top-[28px] w-[1376px] h-[68px] bg-[var(--easeui-bg-panel)] ...`
 *   형태의 클래스 문자열이 한 줄로 나온다.
 * - SwiftUI: `struct <PascalName>View: View` 안 ZStack에 노드당 RoundedRectangle/Text를
 *   .frame(width:height:).position(x:y:) 절대 배치로 쌓는다. 색은 Color(red:green:blue:) 리터럴.
 * - Compose: `@Composable fun <PascalName>()`의 Box(modifier) 안에 Text/Box를
 *   Modifier.absoluteOffset(x:.dp, y:.dp)로 절대 배치한다. 색은 Color(0xAARRGGBB) 리터럴.
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

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const num = parseInt(full, 16);
  return { r: ((num >> 16) & 255) / 255, g: ((num >> 8) & 255) / 255, b: (num & 255) / 255 };
}

function swiftColor(value: string | undefined, doc: Document): string {
  const resolved = resolveColor(value, doc) ?? "#000000";
  const { r, g, b } = hexToRgb(resolved);
  const n = (v: number) => Math.round(v * 1000) / 1000;
  return `Color(red: ${n(r)}, green: ${n(g)}, blue: ${n(b)})`;
}

export function toSwiftUI(root: StudioNode, doc: Document): string {
  function shape(n: StudioNode, absX: number, absY: number, depth: number): string {
    const pad = "    ".repeat(depth);
    const lines: string[] = [`// ${n.name}`];
    if (n.style.fill !== undefined || n.kind === "frame" || n.kind === "rect" || n.kind === "ellipse") {
      const radius = n.style.radius === 999 || n.kind === "ellipse" ? Math.round(Math.min(n.width, n.height) / 2) : n.style.radius ?? 0;
      lines.push(
        `${pad}RoundedRectangle(cornerRadius: ${radius}, style: .continuous)`,
        `${pad}    .fill(${n.style.fill !== undefined ? swiftColor(n.style.fill, doc) : "Color.clear"})`,
        `${pad}    .frame(width: ${Math.round(n.width)}, height: ${Math.round(n.height)})`,
        `${pad}    .position(x: ${Math.round(absX + n.width / 2)}, y: ${Math.round(absY + n.height / 2)})`
      );
      if (n.style.stroke && n.style.strokeWidth) {
        lines.push(
          `${pad}RoundedRectangle(cornerRadius: ${radius}, style: .continuous)`,
          `${pad}    .stroke(${swiftColor(n.style.stroke, doc)}, lineWidth: ${n.style.strokeWidth})`,
          `${pad}    .frame(width: ${Math.round(n.width)}, height: ${Math.round(n.height)})`,
          `${pad}    .position(x: ${Math.round(absX + n.width / 2)}, y: ${Math.round(absY + n.height / 2)})`
        );
      }
    }
    if (n.text) {
      const weight = n.text.fontWeight >= 700 ? ".bold" : n.text.fontWeight >= 600 ? ".semibold" : n.text.fontWeight >= 500 ? ".medium" : ".regular";
      lines.push(
        `${pad}Text("${n.text.text.replace(/"/g, '\\"')}")`,
        `${pad}    .font(.system(size: ${n.text.fontSize}, weight: ${weight}))`,
        `${pad}    .foregroundColor(${n.text.color ? swiftColor(n.text.color, doc) : "Color.primary"})`,
        `${pad}    .position(x: ${Math.round(absX + n.width / 2)}, y: ${Math.round(absY + n.height / 2)})`
      );
    }
    const out = [lines.join("\n")];
    n.children.forEach((c) => out.push(shape(c, absX + c.x, absY + c.y, depth)));
    return out.filter(Boolean).join("\n");
  }

  const name = pascal(root.name) || "Design";
  return [
    "import SwiftUI",
    "",
    `struct ${name}View: View {`,
    "    var body: some View {",
    "        ZStack {",
    shape(root, 0, 0, 3),
    "        }",
    "    }",
    "}",
    "",
    `#Preview { ${name}View() }`,
  ].join("\n");
}

function composeColor(value: string | undefined, doc: Document): string {
  const resolved = resolveColor(value, doc) ?? "#000000";
  const h = resolved.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  return `Color(0xFF${full.toUpperCase()})`;
}

export function toCompose(root: StudioNode, doc: Document): string {
  function element(n: StudioNode, absX: number, absY: number, depth: number): string {
    const pad = "    ".repeat(depth);
    const parts: string[] = [`${pad}// ${n.name}`];
    if (n.text) {
      parts.push(
        `${pad}Text(`,
        `${pad}    text = "${n.text.text.replace(/"/g, '\\"')}",`,
        `${pad}    fontSize = ${n.text.fontSize}.sp,`,
        `${pad}    fontWeight = FontWeight.W${n.text.fontWeight},`,
        `${pad}    color = ${n.text.color ? composeColor(n.text.color, doc) : "Color.Unspecified"},`,
        `${pad}    modifier = Modifier.absoluteOffset(x = ${Math.round(absX)}.dp, y = ${Math.round(absY)}.dp)`,
        `${pad})`
      );
    } else {
      parts.push(
        `${pad}Box(`,
        `${pad}    modifier = Modifier`,
        `${pad}        .size(${Math.round(n.width)}.dp, ${Math.round(n.height)}.dp)`,
        `${pad}        .absoluteOffset(x = ${Math.round(absX)}.dp, y = ${Math.round(absY)}.dp)`,
        ...(n.style.fill !== undefined
          ? [`${pad}        .background(${composeColor(n.style.fill, doc)}, shape = RoundedCornerShape(${n.style.radius ?? 0}.dp))`]
          : []),
        `${pad})`
      );
    }
    const out = [parts.filter(Boolean).join("\n")];
    n.children.forEach((c) => out.push(element(c, absX + c.x, absY + c.y, depth)));
    return out.filter(Boolean).join("\n");
  }

  const name = pascal(root.name) || "Design";
  return [
    "import androidx.compose.foundation.background",
    "import androidx.compose.foundation.layout.*",
    "import androidx.compose.foundation.shape.RoundedCornerShape",
    "import androidx.compose.material.Text",
    "import androidx.compose.runtime.Composable",
    "import androidx.compose.ui.Modifier",
    "import androidx.compose.ui.graphics.Color",
    "import androidx.compose.ui.text.font.FontWeight",
    "import androidx.compose.ui.unit.dp",
    "import androidx.compose.ui.unit.sp",
    "",
    "@Composable",
    `fun ${name}(modifier: Modifier = Modifier) {`,
    "    Box(modifier) {",
    element(root, 0, 0, 2),
    "    }",
    "}",
  ].join("\n");
}
