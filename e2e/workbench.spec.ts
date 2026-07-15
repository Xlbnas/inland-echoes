import { expect, test } from "@playwright/test";

test("rewrites text with the local demo provider", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "极乐迪斯科｜内陆回声" })).toBeVisible();
  await expect(page).toHaveTitle("极乐迪斯科｜内陆回声文本改写器");
  await expect(page.locator('link[rel~="icon"]')).toHaveAttribute("href", /icon\.svg/);
  const source = page.getByLabel("需要改写的原文");
  await source.fill("凌晨三点，我在厨房里找到最后一杯冷咖啡。");
  await page.getByRole("button", { name: "开始侧写" }).click();

  await expect(page.getByText("已完成")).toBeVisible();
  await expect(page.locator(".result-text")).toContainText(
    "凌晨三点，我在厨房里找到最后一杯冷咖啡。",
  );
  await expect(page.getByTestId("check-result")).toHaveCount(0);
});

test("supports selecting multiple providers and custom provider UI", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 自定义线路" }).click();
  await expect(page.getByLabel("添加自定义供应商")).toBeVisible();
  await expect(page.getByLabel("OpenAI 兼容接口地址")).toHaveAttribute(
    "placeholder",
    "https://api.example.com/v1…",
  );
});

test("configures a cognitive channel and shows the estimated chance", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "未启用" }).click();
  await expect(page.getByRole("heading", { name: "2D6 认知频道判定" })).toBeVisible();

  await page.getByRole("button", { name: "逻辑" }).click();
  await page.getByLabel("频道等级").fill("5");
  await page.getByLabel("判定难度").selectOption("12");

  await expect(page.getByRole("button", { name: "逻辑" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("估算成功率")).toBeVisible();
  await expect(page.getByText("58.3%", { exact: true })).toBeVisible();
  await expect(page.getByText("枚举 36 种骰点，双一必败、双六必胜。")).toBeVisible();
});

test("rolls on the server, reveals the formula, then streams matching mock text", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "未启用" }).click();
  await page.getByRole("button", { name: "共情" }).click();
  await page.getByLabel("需要改写的原文").fill("会议结束了，但没有人真正得到答案。");

  const startedAt = Date.now();
  await page.getByRole("button", { name: "投骰并开始侧写" }).click();
  await expect(page.getByRole("button", { name: /正在判定|停止接收/ })).toBeVisible();
  await expect(page.getByTestId("check-result")).toBeVisible();
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(500);

  const dice = page.locator(".die-face[data-die]");
  await expect(dice).toHaveCount(2);
  for (const die of await dice.all()) {
    expect(Number(await die.getAttribute("data-die"))).toBeGreaterThanOrEqual(1);
    expect(Number(await die.getAttribute("data-die"))).toBeLessThanOrEqual(6);
  }
  await expect(page.locator(".check-formula")).toContainText(/\d \+ \d \+ 3 = \d+/);
  await expect(page.locator(".check-result-heading")).toContainText(/通过|未通过|灾难性误判|极佳通过/);
  await expect(page.getByText("已完成")).toBeVisible();
  await expect(page.locator(".result-text")).toContainText("【共情：");
  await expect(page.locator(".result-text")).toContainText("会议结束了，但没有人真正得到答案。");
});

test("supports keyboard generation and clears stale results after editing", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "未启用" }).click();
  const source = page.getByLabel("需要改写的原文");
  await source.fill("我站在门口，想起那封一直没有寄出的信。");
  await source.press("Control+Enter");
  await expect(page.getByTestId("check-result")).toBeVisible();
  await expect(page.getByText("已完成")).toBeVisible();

  await source.fill("文本已经修改。");
  await expect(page.getByTestId("check-result")).toHaveCount(0);
  await expect(page.getByTestId("dice-pair")).toHaveClass(/idle/);
});

test("remains functional with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "未启用" }).click();
  await page.getByLabel("需要改写的原文").fill("雨停了，街道仍然记得它。");
  await page.getByRole("button", { name: "投骰并开始侧写" }).click();
  await expect(page.getByTestId("check-result")).toBeVisible();
  await expect(page.getByText("已完成")).toBeVisible();
});

test("has no horizontal page overflow", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "未启用" }).click();
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasOverflow).toBe(false);
});
