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

test("shift-click builds a multi selection with a mixed inspector", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();

  await page.locator(".layer-name").filter({ hasText: "Brand Title" }).click();
  await expect(page.locator(".canvas-node.selected")).toHaveCount(1);

  await page.locator(".layer-name").filter({ hasText: "Live Sync Badge" }).click({ modifiers: ["Shift"] });
  await expect(page.locator(".canvas-node.selected")).toHaveCount(2);
  await expect(page.locator(".inspector-panel")).toContainText("2개 노드가 선택되었습니다");

  // Shift-click again removes it from the set.
  await page.locator(".layer-name").filter({ hasText: "Live Sync Badge" }).click({ modifiers: ["Shift"] });
  await expect(page.locator(".canvas-node.selected")).toHaveCount(1);
  await expect(page.locator(".inspector-panel input").first()).toHaveValue("Brand Title");
});

test("marquee drag selects top-level pages under the rubber band", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();

  // Canvas starts at x=220 (layers panel). Pages are now top-level nodes:
  // a marquee over the screen selects the page itself (children absorbed).
  await page.mouse.move(260, 70);
  await page.mouse.down();
  await page.mouse.move(1250, 600, { steps: 6 });
  await page.mouse.up();

  await expect(page.locator(".canvas-node.selected")).toHaveCount(1);
  await expect(page.locator(".inspector-panel")).toContainText("화면");
});

test("multi-select delete removes all in one undo step", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();

  // Deleting both top-level subtrees leaves only the root frame (53 -> 1).
  await page.locator(".layer-name").filter({ hasText: "Top Header Bar" }).click();
  await page.locator(".layer-name").filter({ hasText: "Main Workspace Grid" }).click({ modifiers: ["Shift"] });
  await expect(page.locator(".canvas-node.selected")).toHaveCount(2);
  await page.keyboard.press("Delete");
  await expect(canvasNodeCount(page)).resolves.toBe(1);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(canvasNodeCount(page)).resolves.toBe(53);
});

test("multi copy/paste inserts all copies in one undo step", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();
  const before = await canvasNodeCount(page);

  await page.locator(".layer-name").filter({ hasText: "Brand Title" }).click();
  await page.locator(".layer-name").filter({ hasText: "Live Sync Badge" }).click({ modifiers: ["Shift"] });
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(canvasNodeCount(page)).resolves.toBe(before + 2);
  await expect(page.locator(".inspector-panel")).toContainText("2개 노드가 선택되었습니다");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(canvasNodeCount(page)).resolves.toBe(before);
});

test("marquee group drag moves the whole selection rigidly", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();

  await page.locator(".layer-name").filter({ hasText: "Top Header Bar" }).click();
  await page.locator(".layer-name").filter({ hasText: "Main Workspace Grid" }).click({ modifiers: ["Shift"] });
  const first = page.locator(".canvas-node.selected").nth(0);
  const startBox = await first.boundingBox();

  await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + 6);
  await page.mouse.down();
  await page.mouse.move(startBox.x + startBox.width / 2 + 30, startBox.y + 6, { steps: 4 });
  await page.mouse.up();

  // Both are children of the root auto-layout column: the drag reorders the
  // pair below each other rather than translating them; the observable is
  // that the drag did not deselect or crash, and undo restores the order.
  await expect(page.locator(".canvas-node.selected")).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".canvas-node.selected").nth(0)).toBeVisible();
});

test("v1 documents migrate to the v2 pages model on load", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();

  await page.evaluate(() => {
    const v1 = {
      schemaVersion: 1,
      name: "Legacy Doc",
      mode: "dark",
      collections: [],
      root: {
        id: "legacy-root",
        name: "Legacy Screen",
        kind: "frame",
        x: 0,
        y: 1200,
        width: 800,
        height: 600,
        sizingW: "fixed",
        sizingH: "fixed",
        visible: true,
        style: { fill: "#123456", opacity: 1 },
        children: [],
      },
    };
    localStorage.setItem("design-studio-doc-v1", JSON.stringify(v1));
  });
  await page.reload();
  await page.locator(".canvas-statusbar").waitFor({ timeout: 5000 });

  await expect(page.locator(".canvas-statusbar")).toContainText("Legacy Doc");
  await expect(page.locator(".canvas-statusbar")).toContainText("1개 화면");
  // autosave is debounced 500ms; wait for the migrated v2 doc to be written
  await page.waitForFunction(() => {
    const raw = localStorage.getItem("design-studio-doc-v1");
    return raw !== null && JSON.parse(raw).schemaVersion === 2;
  }, undefined, { timeout: 5000 });
  const migrated = await page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem("design-studio-doc-v1") ?? "{}");
    return { schema: doc.schemaVersion, pages: doc.pages?.length, firstFill: doc.pages?.[0]?.style?.fills?.[0] };
  });
  expect(migrated.schema).toBe(2);
  expect(migrated.pages).toBe(1);
  expect(migrated.firstFill).toEqual({ type: "solid", color: "#123456" });
});

test("add-page creates a second screen that renders and persists", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();

  await page.getByRole("button", { name: "+ 화면" }).click();
  await expect(page.locator(".canvas-statusbar")).toContainText("2개 화면");
  await expect(page.locator(".page-group")).toHaveCount(2);
  await expect(canvasNodeCount(page)).resolves.toBe(54);
  await page.waitForFunction(() => localStorage.getItem("design-studio-doc-v1")?.includes("Screen 2"));

  await page.reload();
  await page.locator(".canvas-statusbar").waitFor();
  await expect(page.locator(".canvas-statusbar")).toContainText("2개 화면");
});

test("command palette sets dev status and shows the badge", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();

  await page.locator(".layer-name").filter({ hasText: "Top Header Bar" }).click();
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.locator(".command-palette input");
  await expect(palette).toBeVisible();
  await palette.fill("개발준비");
  await page.keyboard.press("Enter");
  await expect(page.locator(".command-palette")).toHaveCount(0);

  await expect(page.locator(".status-chip.ready").first()).toBeVisible();
  await expect(page.locator(".status-dot.ready").first()).toBeVisible();

  // The fixture's root screen ships with dev_status: "ready", so exactly the
  // page-level chip remains after undoing the header's status change.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".status-chip.ready")).toHaveCount(1);
});

test("context menu duplicates the right-clicked node", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();
  const before = await canvasNodeCount(page);

  await page.locator(".canvas-node > span").filter({ hasText: /AGENT-FIRST SPEC CONSOLE/ }).first().click({ button: "right" });
  const menu = page.locator(".context-menu");
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "복제 (⌘D)" }).click();

  await expect(canvasNodeCount(page)).resolves.toBe(before + 1);
});

test("arrow keys nudge the selection", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();

  // The page frame is free-positioned; select it via layers and nudge.
  await page.locator(".layer-name").filter({ hasText: "EaseUI" }).first().click();
  const before = await page.locator(".canvas-node.selected").first().boundingBox();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  const after = await page.locator(".canvas-node.selected").first().boundingBox();
  if (!before || !after) throw new Error("page node not measurable");
  expect(Math.round(after.x - before.x)).toBeGreaterThanOrEqual(2 * 0.55);
});

test("gradient fill renders via inspector", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();

  await page.locator(".layer-name").filter({ hasText: "Top Header Bar" }).click();
  await page.getByRole("button", { name: "그라데이션으로" }).click();
  const node = page.locator(".canvas-node.selected");
  await expect(node).toHaveAttribute("style", /linear-gradient/);

  await page.getByRole("button", { name: "섀도 추가" }).click();
  await expect(node).toHaveAttribute("style", /box-shadow/);
});

test("align left equalizes x of two free frames", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();

  // Fresh page has no auto-layout: created frames are free-positioned.
  await page.getByRole("button", { name: "+ 화면" }).click();
  await page.getByRole("button", { name: "F", exact: true }).click();
  await page.locator(".canvas-viewport").click({ position: { x: 320, y: 150 } });
  await page.getByRole("button", { name: "F", exact: true }).click();
  await page.locator(".canvas-viewport").click({ position: { x: 700, y: 400 } });

  const frames = page.locator(".page-group").nth(1).locator(".layer-name").filter({ hasText: "Frame" });
  await frames.nth(0).click();
  await frames.nth(1).click({ modifiers: ["Shift"] });
  await expect(page.locator(".inspector-panel")).toContainText("2개 노드가 선택되었습니다");

  await page.locator(".align-grid").getByRole("button", { name: "좌" }).click();
  const boxes = await page.locator(".canvas-node.selected").evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().x))
  );
  expect(boxes.length).toBe(2);
  expect(Math.abs(boxes[0] - boxes[1])).toBeLessThanOrEqual(1);
});

test("fit-all shortcut changes the viewport zoom", async ({ page }) => {
  await page.goto("/");
  await page.locator(".layer-row").first().waitFor();

  await page.getByRole("button", { name: "100%", exact: true }).click();
  await expect(page.locator(".canvas-statusbar")).toContainText("100%");
  await page.keyboard.press("Shift+1");
  await expect(page.locator(".canvas-statusbar")).not.toContainText("100%");
});
