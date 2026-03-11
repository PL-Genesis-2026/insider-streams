import { test, expect } from "./fixtures";

test.describe("Create auction flow", () => {
  test("loads the create auction page with form fields", async ({ page }) => {
    await page.goto("/create");
    await page.waitForLoadState("networkidle");

    // Page title
    await expect(page.getByText("Sell your signal")).toBeVisible();

    // The event selector should be present (either loading or showing events)
    await expect(
      page.getByText("Prediction market event", { exact: true }),
    ).toBeVisible({ timeout: 10_000 });

    // The form should have a combobox for event selection
    await expect(page.getByRole("combobox").first()).toBeVisible();
  });

  test("form structure is complete when wallet connected", async ({
    page,
  }) => {
    await page.goto("/create");
    await page.waitForLoadState("networkidle");

    // Wait for the form to render
    await expect(page.getByText("Sell your signal")).toBeVisible();

    // Check all form fields exist
    await expect(page.getByText("Prediction market event", { exact: true })).toBeVisible();
    await expect(page.getByRole("combobox").first()).toBeVisible();

    // Secret payload textarea
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();

    // Duration selector
    await expect(page.getByText(/duration/i)).toBeVisible();
  });
});
