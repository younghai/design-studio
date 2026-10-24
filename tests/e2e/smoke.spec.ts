import { expect, test } from "@playwright/test";

const SPEC = {
  name: "E2E Spec Screen",
  preset: "easeui-screen",
  width: 800,
  height: 600,
  layout: { dir: "row", gap: 8, padding: [16, 16, 16, 16], align: "center", justify: "start" },
  children: [{ name: "Hello", kind: "text", text: "E2E 텍스트", font_size: 24, font_weight: 700 }],
};

async function canvasNodeCount(page: import("@playwright/test").Page): Promise<number> {
  return page.locator(".canvas-node").count();
}

test("initial load renders the easeui document", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("DESIGN Studio");
  await expect(canvasNodeCount(page)).resolves.toBe(53);
  await expect(page.locator(".canvas-statusbar")).toContainText("EaseUI");
});

test("spec apply loads a document and undo restores the previous one", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();

  await page.setInputFiles(".toolbar input[type=file] >> nth=0", {
    name: "e2e.spec.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(SPEC)),
  });
  await expect(page.locator(".canvas-statusbar")).toContainText("E2E Spec Screen", { timeout: 5000 });
  await expect(canvasNodeCount(page)).resolves.toBe(2);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".canvas-statusbar")).toContainText("EaseUI");
  await expect(canvasNodeCount(page)).resolves.toBe(53);
});

test("invalid spec is rejected atomically with an error toast", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();
  const before = await canvasNodeCount(page);

  await page.setInputFiles(".toolbar input[type=file] >> nth=0", {
    name: "bad.spec.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ name: "Bad", width: "nope", children: "oops" })),
  });
  await expect(page.locator(".toast")).toContainText("스펙 거부", { timeout: 5000 });
  expect(await canvasNodeCount(page)).toBe(before);
});

test("light/dark mode switches live without reload", async ({ page }) => {
  await page.goto("/");
  await page.locator(".canvas-statusbar").waitFor();
  const nav = page.context().pages().length;

  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator(".canvas-statusbar")).toContainText("LIGHT");
  await expect(
    page.locator(".canvas-node").filter({ hasText: "DESIGN:OS STUDIO" }).first()
  ).toBeVisible();
  expect(page.context().pages().length).toBe(nav);
});

test("dev mode generates code for the selected node", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").nth(1).click();
  await page.keyboard.press("Shift+d");
  await expect(page.locator(".inspector-panel .panel-header")).toContainText("Dev Mode", { timeout: 5000 });
  const code = page.locator(".inspector-panel pre");
  await expect(code).toContainText("export function");
});

test("frame tool creates a node and undo removes it", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();
  const before = await canvasNodeCount(page);

  await page.getByRole("button", { name: "F", exact: true }).click();
  await page.locator(".canvas-viewport").click({ position: { x: 200, y: 650 } });
  await expect(canvasNodeCount(page)).resolves.toBe(before + 1);
  await expect(page.locator(".layer-name").filter({ hasText: "Frame" })).toHaveCount(1);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(canvasNodeCount(page)).resolves.toBe(before);
});

test("selection handle resize commits the new size", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();

  // A created Frame joins the root auto-layout column and lands at doc y≈896,
  // off-viewport at 100% zoom. Resize an existing on-screen spec node instead.
  await page.getByRole("button", { name: "100%", exact: true }).click();
  await page.locator(".layer-name").filter({ hasText: "Brand Title" }).click();

  const target = page.locator(".canvas-node.selected");
  const start = await target.boundingBox();
  if (!start) throw new Error("selected node not measurable");
  expect(start.y).toBeGreaterThan(0);
  expect(start.y + start.height).toBeLessThan(720);

  const handle = page.locator('.selection-handle[style*="left: 100%"][style*="top: 100%"]');
  const box = await handle.boundingBox();
  if (!box) throw new Error("handle not measurable");

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 64, cy + 34, { steps: 4 });
  await page.mouse.up();

  const after = await target.boundingBox();
  if (!after) throw new Error("node gone after resize");
  expect(after.width).toBeGreaterThan(start.width + 55);
  expect(after.height).toBeGreaterThan(start.height + 25);
});

test("export triggers a download of the current document", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "내보내기" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/easeui.*\.design\.json$/i);
});

test("duplicate (⌘D) places a sibling copy next to the selection", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();
  const before = await canvasNodeCount(page);

  await page.locator(".layer-name").filter({ hasText: "Brand Title" }).click();
  await page.keyboard.press("ControlOrMeta+d");
  await expect(canvasNodeCount(page)).resolves.toBe(before + 1);
  await expect(page.locator(".layer-name").filter({ hasText: "Brand Title" })).toHaveCount(2);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(canvasNodeCount(page)).resolves.toBe(before);
});

test("copy/paste duplicates the selected node with ⌘C ⌘V", async ({ page }) => {  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();
  const before = await canvasNodeCount(page);

  await page.locator(".layer-name").filter({ hasText: "Brand Title" }).click();
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(canvasNodeCount(page)).resolves.toBe(before + 1);

  const copies = page.locator(".layer-name").filter({ hasText: "Brand Title" });
  await expect(copies).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(canvasNodeCount(page)).resolves.toBe(before);
});

test("cut removes the node and paste restores it elsewhere", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();
  const before = await canvasNodeCount(page);

  await page.locator(".layer-name").filter({ hasText: "Brand Title" }).click();
  await page.keyboard.press("ControlOrMeta+x");
  await expect(canvasNodeCount(page)).resolves.toBe(before - 1);

  await page.keyboard.press("ControlOrMeta+v");
  await expect(canvasNodeCount(page)).resolves.toBe(before);
  await expect(page.locator(".layer-name").filter({ hasText: "Brand Title" })).toHaveCount(1);
});

test("double-click opens inline text editing and Enter commits", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();

  // hasText is case-insensitive and also matches the document title
  // ("Agent-First Spec Console"); a case-sensitive regex pins the span.
  const span = page.locator(".canvas-node > span").filter({ hasText: /AGENT-FIRST SPEC CONSOLE/ });
  await expect(span).toHaveCount(1);
  await span.dblclick();
  const editor = page.locator(".canvas-node textarea");
  await expect(editor).toBeVisible();
  await editor.fill("EDITED VIA INLINE");
  await editor.press("Enter");
  await expect(page.locator(".canvas-node > span").filter({ hasText: /EDITED VIA INLINE/ })).toHaveCount(1);
  await expect(page.locator(".canvas-node textarea")).toHaveCount(0);
});

test("SVG export downloads an svg of the selection", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();

  await page.locator(".layer-name").filter({ hasText: "Brand Title" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "SVG", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("brand-title.svg");
});

test("PNG export downloads a rasterized selection", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();

  await page.locator(".layer-name").filter({ hasText: "Brand Title" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "PNG", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("brand-title.png");
});

test("dev mode generates SwiftUI and Compose targets", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();

  await page.locator(".layer-name").filter({ hasText: "Brand Title" }).click();
  await page.keyboard.press("Shift+d");
  await expect(page.locator(".inspector-panel .panel-header")).toContainText("Dev Mode");

  await page.getByRole("button", { name: "SwiftUI", exact: true }).click();
  await expect(page.locator(".inspector-panel pre")).toContainText("Text(");
  await expect(page.locator(".inspector-panel pre")).toContainText(".font(.system(size:");

  await page.getByRole("button", { name: "Compose", exact: true }).click();
  await expect(page.locator(".inspector-panel pre")).toContainText("@Composable");
  await expect(page.locator(".inspector-panel pre")).toContainText("Modifier.absoluteOffset");
});

test("deeply nested adversarial spec is rejected without crashing", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();
  const before = await canvasNodeCount(page);

  let deep: Record<string, unknown> = { name: "Leaf", kind: "text" };
  // Above the MAX_NODE_DEPTH=64 rejection threshold, below Node's own
  // JSON.stringify recursion limit.
  for (let i = 0; i < 200; i += 1) {
    deep = { name: `N${i}`, kind: "frame", children: [deep] };
  }
  await page.setInputFiles(".toolbar input[type=file] >> nth=0", {
    name: "deep.spec.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(deep)),
  });
  await expect(page.locator(".toast")).toContainText("스펙 거부", { timeout: 5000 });
  expect(await canvasNodeCount(page)).toBe(before);
});

test("corrupted localStorage is discarded instead of crash-looping", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();

  await page.evaluate(() => {
    const poisoned = {
      schemaVersion: 1,
      name: "Poison",
      mode: "dark",
      collections: [],
      root: { id: "r", name: "Poison", kind: "frame", x: 0, y: 0, width: 10, height: 10, children: "not-an-array" },
    };
    localStorage.setItem("design-studio-doc-v1", JSON.stringify(poisoned));
  });
  await page.reload();
  await page.locator(".canvas-statusbar").waitFor({ timeout: 5000 });
  // Restore dropped the poisoned doc; the fixture loads instead of an error screen.
  await expect(page.locator(".canvas-statusbar")).toContainText("EaseUI");
  await expect(canvasNodeCount(page)).resolves.toBe(53);
});

test("SVG export escapes attribute injection from spec fills", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();

  const malicious = {
    name: "XSS Screen",
    width: 100,
    height: 100,
    fill: 'red" onload="alert(1)',
    children: [],
  };
  await page.setInputFiles(".toolbar input[type=file] >> nth=0", {
    name: "xss.spec.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(malicious)),
  });
  await expect(page.locator(".canvas-statusbar")).toContainText("XSS Screen", { timeout: 5000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "SVG", exact: true }).click(),
  ]);
  const path = await download.path();
  const svg = path ? (await import("node:fs")).readFileSync(path, "utf8") : "";
  expect(svg).toContain("fill=");
  expect(svg).not.toContain('onload="');
});

test("rapid same-millisecond creates get unique ids", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();
  const before = await canvasNodeCount(page);

  await page.getByRole("button", { name: "F", exact: true }).click();
  await page.locator(".canvas-viewport").click({ position: { x: 100, y: 200 } });
  await page.getByRole("button", { name: "F", exact: true }).click();
  await page.locator(".canvas-viewport").click({ position: { x: 400, y: 200 } });
  await expect(canvasNodeCount(page)).resolves.toBe(before + 2);
  await expect(page.locator(".layer-name").filter({ hasText: "Frame" })).toHaveCount(2);

  // Both must be independently selectable (duplicate ids would collapse this).
  const frames = page.locator(".layer-name").filter({ hasText: "Frame" });
  await frames.nth(0).click();
  await expect(page.locator(".canvas-node.selected")).toHaveCount(1);
  await frames.nth(1).click();
  await expect(page.locator(".canvas-node.selected")).toHaveCount(1);
});
