import { expect, test } from '@playwright/test';
import { getPrimaryE2EUser } from '../../setup/users.mock';
import { NEW_CHAT_PATH, selectModelSpec } from './helpers';

/** Spec with `showOnLanding: true` and an HTML `description` in e2e/config/librechat.e2e.yaml. */
const BRANDED_SPEC = {
  label: 'E2E Branded',
  descriptionText: 'Branded answers',
  descriptionIcon: '/assets/openai.svg',
};

/** The `softDefault: true` spec does not set `showOnLanding`, so it is unbranded. */
const UNBRANDED_SPEC_LABEL = 'E2E Soft Default';
const FUTURE_LINES_SPEC_LABEL = '人生设计室';

test.describe('model spec branding on landing', () => {
  test('branded spec replaces the greeting with its label and rendered description', async ({
    page,
  }) => {
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectModelSpec(page, BRANDED_SPEC.label);

    const main = page.getByRole('main');
    await expect(main).toContainText(BRANDED_SPEC.label);
    await expect(main).toContainText(BRANDED_SPEC.descriptionText);
    await expect(main.locator(`img[src$="${BRANDED_SPEC.descriptionIcon}"]`)).toBeVisible();

    const user = getPrimaryE2EUser();
    await expect(main).not.toContainText(user.name);
  });

  test('unbranded spec keeps the personalized greeting', async ({ page }) => {
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectModelSpec(page, UNBRANDED_SPEC_LABEL);

    const user = getPrimaryE2EUser();
    await expect(page.getByRole('main')).toContainText(user.name);
  });

  test('branded spec renders its description in the model selector', async ({ page }) => {
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });

    await page.getByTestId('model-selector-button').first().click();
    const option = page.getByRole('option', { name: new RegExp(BRANDED_SPEC.label) });
    await expect(option).toContainText(BRANDED_SPEC.descriptionText);
    await expect(option.locator(`img[src$="${BRANDED_SPEC.descriptionIcon}"]`)).toBeVisible();
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 375, height: 812 },
  ]) {
    test(`future-lines landing stays inside a ${viewport.width}px viewport`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
      await selectModelSpec(page, FUTURE_LINES_SPEC_LABEL);
      await page.keyboard.press('Escape');

      const main = page.getByRole('main');
      const title = main.locator('.split-parent');
      const description = main.locator('.animate-fadeIn');
      await expect(title).toBeVisible();
      await expect(description).toBeVisible();

      const layout = await page.evaluate(() => {
        const visibleBounds = (element: Element | null) => {
          const rect = element?.getBoundingClientRect();
          return rect ? { left: rect.left, right: rect.right } : null;
        };
        const titleElement = document.querySelector('.split-parent');
        const descriptionElement = document.querySelector('.animate-fadeIn');

        return {
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          title: visibleBounds(titleElement),
          description: visibleBounds(descriptionElement),
        };
      });

      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
      expect(layout.title?.left).toBeGreaterThanOrEqual(0);
      expect(layout.title?.right).toBeLessThanOrEqual(layout.clientWidth);
      expect(layout.description?.left).toBeGreaterThanOrEqual(0);
      expect(layout.description?.right).toBeLessThanOrEqual(layout.clientWidth);
    });
  }
});
