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
});

test("supports selecting multiple providers and custom provider UI", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 自定义线路" }).click();
  await expect(page.getByLabel("添加自定义供应商")).toBeVisible();
  await expect(page.getByLabel("OpenAI 兼容接口地址")).toHaveAttribute(
    "placeholder",
    "https://api.example.com/v1",
  );
});
