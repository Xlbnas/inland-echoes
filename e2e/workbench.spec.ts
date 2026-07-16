import { expect, test } from "@playwright/test";

test("renders, hydrates, exposes icons, and keeps the intro interactive", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  const title = page.getByRole("heading", { name: "极乐迪斯科｜内陆回声" });
  const workbench = page.getByRole("heading", { name: "现场口供" });
  await expect(title).toBeVisible();
  await expect(workbench).toBeVisible();
  await expect(page).toHaveTitle("极乐迪斯科｜内陆回声文本改写器");
  await expect(page.locator('link[rel~="icon"]')).toHaveAttribute("href", /icon\.svg/);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /apple-icon/);

  const detectiveStyle = page.getByRole("radio", { name: "侦探" });
  await detectiveStyle.click({ force: true });
  await expect(detectiveStyle).toBeChecked();
  await expect(page.locator("#main-content")).toHaveAttribute("data-motion-state", "entered");

  expect(consoleErrors.filter((error) => /hydration|did not match/i.test(error))).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("rewrites text with the local demo provider", async ({ page }) => {
  await page.goto("/");

  const source = page.getByLabel("需要改写的原文");
  await source.fill("凌晨三点，我在厨房里找到最后一杯冷咖啡。");
  await page.getByRole("button", { name: "开始侧写" }).click();

  await expect(page.locator('.result[data-state="done"]')).toBeVisible();
  await expect(page.getByText("已完成")).toBeVisible();
  await expect(page.locator(".result-text")).toContainText(
    "凌晨三点，我在厨房里找到最后一杯冷咖啡。",
  );
  await expect(page.locator(".result-text")).toContainText("【逻辑】");
  await expect(page.locator(".result-text")).toContainText("【直觉】");
  await expect(page.locator(".result-text")).not.toContainText(/通过|未通过|灾难性误判|极佳通过/u);
  await expect(page.getByTestId("check-result")).toHaveCount(0);
});

test("switches styles and provider selections without layout replacement", async ({ page }) => {
  await page.goto("/");

  for (const name of ["侦探", "幽默", "内心", "抒情"]) {
    const option = page.getByRole("radio", { name });
    await option.click();
    await expect(option).toBeChecked();
    await expect(page.locator(".style-indicator")).toHaveCount(1);
  }

  const deepSeek = page.getByRole("checkbox", { name: /^DeepSeek / });
  await deepSeek.check();
  await expect(deepSeek).toBeChecked();
  await expect(page.getByText("模型线路 · 2/3")).toBeVisible();
});

test("默认不显示自定义线路入口和表单", async ({ page }) => {
  await page.goto("/");
  const toggle = page.locator('button[aria-controls="custom-provider-fields"]');
  const form = page.getByLabel("添加自定义供应商");
  await expect(toggle).toHaveCount(0);
  await expect(form).toHaveCount(0);
});

test("关闭判定的侦探风格不生成逻辑通过", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("radio", { name: "侦探" }).click();
  await page.getByLabel("需要改写的原文").fill("会议结束了，但没有人真正得到答案。");
  await page.getByRole("button", { name: "开始侧写" }).click();
  await expect(page.locator('.result[data-state="done"]')).toBeVisible();
  await expect(page.locator(".result-text")).not.toContainText(/逻辑：通过|未通过|灾难性误判|极佳通过/u);
});

test("expands and collapses the cognitive check panel", async ({ page }) => {
  await page.goto("/");
  const panel = page.locator(".check-panel");
  const toggle = page.getByRole("button", { name: "未启用" });

  await expect(panel).toHaveAttribute("data-state", "closed");
  await toggle.click();
  await expect(panel).toHaveAttribute("data-state", "open");
  await expect(page.locator("#check-panel-body")).toHaveAttribute("data-state", "open");
  await page.getByRole("button", { name: "已启用" }).click();
  await expect(panel).toHaveAttribute("data-state", "closed");
  await expect(page.locator("#check-panel-body")).toHaveCount(0);
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

test("rolls on the server, resolves semantic state, then streams matching mock text", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "未启用" }).click();
  await page.getByRole("button", { name: "共情" }).click();
  await page.getByLabel("需要改写的原文").fill("会议结束了，但没有人真正得到答案。");

  await page.getByRole("button", { name: "投骰并开始侧写" }).click();
  await expect(page.getByTestId("dice-pair")).toHaveAttribute("data-state", "rolling");
  await expect(page.getByTestId("check-result")).toHaveAttribute("data-state", "resolved");
  await expect(page.getByTestId("dice-pair")).toHaveAttribute("data-state", "resolved");

  const dice = page.locator(".die-face[data-die]");
  await expect(dice).toHaveCount(2);
  for (const die of await dice.all()) {
    expect(Number(await die.getAttribute("data-die"))).toBeGreaterThanOrEqual(1);
    expect(Number(await die.getAttribute("data-die"))).toBeLessThanOrEqual(6);
  }
  await expect(page.locator(".check-formula")).toContainText(/\d \+ \d \+ 3 = \d+/);
  await expect(page.locator(".check-result-heading")).toContainText(/通过|未通过|灾难性误判|极佳通过/);
  await expect(page.locator('.result[data-state="done"]')).toBeVisible();
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
  await expect(page.locator('.result[data-state="done"]')).toBeVisible();

  await source.fill("文本已经修改。");
  await expect(page.getByTestId("check-result")).toHaveCount(0);
  await expect(page.getByTestId("dice-pair")).toHaveAttribute("data-state", "idle");
});

test("replaces the typewriter buffer on consecutive generations", async ({ page }) => {
  await page.goto("/");
  const source = page.getByLabel("需要改写的原文");
  await source.fill("第一份记录。");
  await page.getByRole("button", { name: "开始侧写" }).click();
  await expect(page.locator('.result[data-state="done"]')).toContainText("第一份记录。");

  await source.fill("第二份记录。");
  await page.getByRole("button", { name: "开始侧写" }).click();
  const result = page.locator('.result[data-state="done"]');
  await expect(result).toContainText("第二份记录。");
  await expect(result).not.toContainText("第一份记录。");
});

test("stops an in-flight request and restores the primary action", async ({ page }) => {
  await page.goto("/");
  const source = page.getByLabel("需要改写的原文");
  await source.fill("一".repeat(1000));
  await page.getByRole("button", { name: "开始侧写" }).click();
  await page.getByRole("button", { name: "停止接收" }).click();

  await expect(page.getByRole("status")).toContainText("生成已停止");
  await expect(page.getByRole("button", { name: "开始侧写" })).toBeVisible();
});

test("copies output, announces success, and restores the label using the browser clock", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByLabel("需要改写的原文").fill("雨停了，街道仍然记得它。");
  await page.getByRole("button", { name: "开始侧写" }).click();
  await expect(page.locator('.result[data-state="done"]')).toBeVisible();

  await page.clock.install();
  const copyButton = page.getByRole("button", { name: "复制" });
  await copyButton.click();
  await expect(page.getByRole("button", { name: "已复制" })).toBeVisible();
  await page.clock.fastForward(1500);
  await expect(page.getByRole("button", { name: "复制" })).toBeVisible();
});

test("renders ordered multi-provider cards from a streamed response", async ({ page }) => {
  await page.route("**/api/rewrite", async (route) => {
    const events = [
      { type: "provider_start", providerId: "mock", label: "本地演示" },
      { type: "provider_start", providerId: "deepseek", label: "DeepSeek" },
      { type: "provider_delta", providerId: "mock", delta: "本地线路记录。" },
      { type: "provider_done", providerId: "mock" },
      { type: "provider_delta", providerId: "deepseek", delta: "远端线路记录。" },
      { type: "provider_done", providerId: "deepseek" },
    ];
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
    });
  });

  await page.goto("/");
  await page.getByRole("checkbox", { name: /^DeepSeek / }).check();
  await page.getByLabel("DeepSeek 临时密钥").fill("test-key");
  await page.getByLabel("需要改写的原文").fill("两条线路同时接入。");
  await page.getByRole("button", { name: "开始侧写" }).click();

  const results = page.locator("article.result");
  await expect(results).toHaveCount(2);
  await expect(results.nth(0)).toContainText("本地线路记录。");
  await expect(results.nth(1)).toContainText("远端线路记录。");
  await expect(results.nth(0)).toHaveAttribute("data-state", "done");
  await expect(results.nth(1)).toHaveAttribute("data-state", "done");
});

test("shows a stable result card when a provider reports an error", async ({ page }) => {
  await page.route("**/api/rewrite", async (route) => {
    const events = [
      { type: "provider_start", providerId: "mock", label: "本地演示" },
      { type: "provider_error", providerId: "mock", message: "线路暂时无法接入" },
    ];
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
    });
  });

  await page.goto("/");
  await page.getByLabel("需要改写的原文").fill("测试错误线路。");
  await page.getByRole("button", { name: "开始侧写" }).click();

  const result = page.locator('article.result[data-state="error"]');
  await expect(result).toBeVisible();
  await expect(result).toContainText("调用失败");
  await expect(result).toContainText("线路暂时无法接入");
});

test("remains functional and has no running motion in reduced-motion mode", async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydration|did not match/i.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("#main-content")).toHaveAttribute("data-motion-state", "entered");
  await page.getByRole("button", { name: "未启用" }).click();
  await page.getByLabel("需要改写的原文").fill("雨停了，街道仍然记得它。");
  await page.getByRole("button", { name: "投骰并开始侧写" }).click();
  await expect(page.getByTestId("check-result")).toHaveAttribute("data-state", "resolved");
  await expect(page.locator('.result[data-state="done"]')).toBeVisible();

  await expect.poll(() => page.evaluate(
    () => document.getAnimations().filter((animation) => animation.playState === "running").length,
  )).toBe(0);
  expect(hydrationErrors).toEqual([]);
});

test("has no horizontal page overflow", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "未启用" }).click();
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasOverflow).toBe(false);
});

test("configures a trusted or custom SiliconFlow model and clears stale output", async ({ page }) => {
  let submittedModel = "";
  await page.route("**/api/rewrite", async (route) => {
    const body = route.request().postDataJSON();
    submittedModel = body.providers.find((provider: { id: string }) => provider.id === "siliconflow")?.model || "";
    const label = `SiliconFlow · ${submittedModel.split("/").at(-1)}`;
    const events = [
      { type: "provider_start", providerId: "siliconflow", label },
      { type: "provider_delta", providerId: "siliconflow", delta: "模型选择测试结果。" },
      { type: "provider_done", providerId: "siliconflow" },
    ];
    await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: `${events.map((event) => JSON.stringify(event)).join("\n")}\n` });
  });

  await page.goto("/");
  await page.getByRole("checkbox", { name: /^SiliconFlow / }).check();
  await page.getByRole("checkbox", { name: /^本地演示 / }).uncheck();
  await expect(page.getByRole("heading", { name: "SiliconFlow 模型" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "系统推荐" })).toBeChecked();
  await expect(page.locator(".model-card code")).toContainText("deepseek-ai/DeepSeek-V4-Flash");

  await page.getByLabel("需要改写的原文").fill("第一轮结果。");
  await page.getByRole("button", { name: "开始侧写" }).click();
  await expect(page.locator('.result[data-state="done"]')).toBeVisible();

  await page.getByRole("radio", { name: "自定义模型" }).click();
  await expect(page.locator("article.result")).toHaveCount(0);
  const modelInput = page.getByLabel("模型 ID");
  await modelInput.fill("https://example.com/model");
  await expect(modelInput).toHaveAttribute("aria-invalid", "true");
  await modelInput.fill("vendor/custom-model");
  await expect(page.getByText(/要求自定义模型使用你自己的临时 API Key/)).toBeVisible();
  await page.getByLabel("SiliconFlow 临时密钥").fill("test-key");
  await page.getByLabel("需要改写的原文").fill("第二轮结果。");
  await page.getByRole("button", { name: "开始侧写" }).click();

  expect(submittedModel).toBe("vendor/custom-model");
  await expect(page.locator("article.result")).toContainText("SiliconFlow · custom-model");
  await expect(page.locator("article.result")).toContainText("模型选择测试结果。");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});
