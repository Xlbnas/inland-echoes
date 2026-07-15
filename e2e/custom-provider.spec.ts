import { expect, test } from "@playwright/test";

test("显式开启后显示自定义线路入口和安全提示", async ({ page }) => {
  await page.goto("/");
  const toggle = page.locator('button[aria-controls="custom-provider-fields"]');
  const form = page.getByLabel("添加自定义供应商");

  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(form).toBeVisible();
  await expect(form).toHaveAttribute("data-state", "open");
  await expect(page.getByText("自定义线路会将本次正文和临时密钥发送到你填写的服务地址。"))
    .toBeVisible();
  await expect(page.getByLabel("OpenAI 兼容接口地址")).toHaveAttribute(
    "placeholder",
    "https://api.example.com/v1…",
  );

  await toggle.click();
  await expect(form).toHaveCount(0);
  await toggle.click();
  await expect(form).toBeVisible();
});
