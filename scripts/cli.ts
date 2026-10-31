/**
 * design-studio CLI — headless spec → document/SVG/codegen pipeline.
 * Usage: pnpm cli --spec examples/x.spec.json [--out outdir]
 * Enables "design as code" in CI without a browser.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { specNodeToNode, specToDocument } from "../src/model/fixtures";
import { validateSpec } from "../src/io/documentIo";
import { relayoutTree } from "../src/model/relayout";
import { nodeToSvg } from "../src/io/imageExport";
import { toCompose, toCss, toReact, toSwiftUI, toTailwind } from "../src/devmode/codegen";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const specPath = arg("spec");
const outDir = arg("out") ?? "dist-cli";
if (!specPath) {
  console.error("usage: pnpm cli --spec <file.spec.json> [--out <dir>]");
  process.exit(1);
}

const raw: unknown = JSON.parse(readFileSync(specPath, "utf8"));
const check = validateSpec(raw);
if (!check.ok) {
  console.error(`spec 거부: ${check.errors.join(", ")}`);
  process.exit(1);
}

const doc = specToDocument(raw as Parameters<typeof specNodeToNode>[0]);
mkdirSync(outDir, { recursive: true });

writeFileSync(join(outDir, "document.design.json"), JSON.stringify(doc, null, 2));
doc.pages.forEach((page, i) => {
  const placed = relayoutTree(page);
  const slug = page.name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase() || `page-${i + 1}`;
  writeFileSync(join(outDir, `${slug}.svg`), nodeToSvg(placed, doc));
  writeFileSync(join(outDir, `${slug}.react.jsx`), toReact(placed, doc));
  writeFileSync(join(outDir, `${slug}.css`), toCss(placed, doc));
  writeFileSync(join(outDir, `${slug}.tailwind.html`), toTailwind(placed, doc));
  writeFileSync(join(outDir, `${slug}.swiftui.swift`), toSwiftUI(placed, doc));
  writeFileSync(join(outDir, `${slug}.compose.kt`), toCompose(placed, doc));
});

console.log(
  `OK: ${doc.pages.length}페이지 → ${outDir}/ (document.design.json, 페이지별 svg/react/css/tailwind/swiftui/compose)`
);
