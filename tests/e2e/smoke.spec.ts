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
