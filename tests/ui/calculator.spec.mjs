import { test, expect } from '@playwright/test';

const openCalculator = async (page) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
};

const setWorkers = async (page, workers) => {
  await page.locator('#workers').fill(String(workers));
  await page.locator('#workers').press('Tab');
};

test('loads the default month and preserves preset period rules', async ({ page }) => {
  await openCalculator(page);
  await expect(page.locator('#month_select')).toHaveValue('8');
  await expect(page.locator('#start_date_display')).toHaveText(/2026-08-03/);
  await expect(page.locator('#end_date_display')).toHaveText(/2026-09-06/);
  await expect(page.locator('#weeks')).toHaveText('5');
  await expect(page.locator('#basic')).toHaveText('10');
  await expect(page.locator('#bonus')).toHaveText('1');

  await page.locator('#month_select').selectOption('1');
  await expect(page.locator('#weeks')).toHaveText('4');
  await expect(page.locator('#start_date_display')).toHaveText(/2026-01-05/);
  await expect(page.locator('#end_date_display')).toHaveText(/2026-02-01/);
  await expect(page.locator('#prev_month')).toBeDisabled();
  await page.locator('#next_month').click();
  await expect(page.locator('#month_select')).toHaveValue('2');

  await page.locator('#month_select').selectOption('12');
  await expect(page.locator('#next_month')).toBeDisabled();
  await page.locator('#prev_month').click();
  await expect(page.locator('#month_select')).toHaveValue('11');
});

test('preserves valid staffing choices and announces only necessary clamps', async ({ page }) => {
  await openCalculator(page);
  await expect(page.locator('#workers')).toHaveValue('6');
  await expect(page.locator('#mon_sat')).toHaveValue('4');
  await expect(page.locator('#sun')).toHaveValue('2');

  await page.locator('#mon_sat').selectOption('3');
  await page.locator('#sun').selectOption('1');
  await setWorkers(page, 5);
  await expect(page.locator('#mon_sat')).toHaveValue('3');
  await expect(page.locator('#sun')).toHaveValue('1');
  await expect(page.locator('#adjustment_notice')).toBeEmpty();

  await setWorkers(page, 3);
  await expect(page.locator('#mon_sat')).toHaveValue('2');
  await expect(page.locator('#sun')).toHaveValue('1');
  await expect(page.locator('#adjustment_notice')).toContainText('자동 조정');
});

test('renders feasible, infeasible, validation and recalculated results', async ({ page }) => {
  await openCalculator(page);
  await page.locator('#calculate_button').dblclick();
  await expect(page.locator('#result')).toHaveClass(/success/);
  await expect(page.locator('#result')).toContainText('작성이 가능합니다');
  await expect(page.locator('#calculate_button')).toBeEnabled();

  await setWorkers(page, 1);
  await expect(page.locator('#mon_sat')).toHaveValue('1');
  await expect(page.locator('#sun')).toHaveValue('1');
  await page.locator('#calculate_button').click();
  await expect(page.locator('#result')).toHaveClass(/infeasible/);
  await expect(page.locator('#result')).toContainText('인·일');

  await setWorkers(page, 2);
  await page.locator('#calculate_button').click();
  await expect(page.locator('#result')).toHaveClass(/success/);

  await page.locator('#workers').fill('0');
  await page.locator('#calculate_button').click();
  await expect(page.locator('#result')).toHaveClass(/input-error/);
  await expect(page.locator('#workers')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#workers')).toBeFocused();
  await expect(page.locator('#error_summary')).toBeVisible();
});

test('supports keyboard operation and visible focus without trapping context', async ({ page }) => {
  await openCalculator(page);
  await page.locator('#month_select').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#month_select')).toHaveValue('7');
  const focusStyle = await page.locator('#month_select').evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(focusStyle.style).toBe('solid');
  expect(Number.parseFloat(focusStyle.width)).toBeGreaterThanOrEqual(3);

  await page.locator('#calculate_button').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#result')).toHaveClass(/success/);
  await expect(page.locator('#result')).toBeFocused();
});

test('changes one month for horizontal swipes and ignores vertical or interactive gestures', async ({ page }) => {
  await openCalculator(page);
  const swipe = (selector, events) => page.locator(selector).evaluate((target, values) => {
    for (const [type, init] of values) {
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true, pointerId: 1, ...init }));
    }
  }, events);

  await swipe('#month_swipe_area', [['pointerdown', { clientX: 260, clientY: 100 }], ['pointerup', { clientX: 190, clientY: 105 }]]);
  await expect(page.locator('#month_select')).toHaveValue('9');
  await swipe('#month_swipe_area', [['pointerdown', { clientX: 200, clientY: 100 }], ['pointerup', { clientX: 205, clientY: 175 }]]);
  await expect(page.locator('#month_select')).toHaveValue('9');
  await swipe('#month_swipe_area', [['pointerdown', { clientX: 220, clientY: 100 }], ['pointercancel', { clientX: 160, clientY: 105 }], ['pointerup', { clientX: 160, clientY: 105 }]]);
  await expect(page.locator('#month_select')).toHaveValue('9');
  await swipe('#month_select', [['pointerdown', { clientX: 240, clientY: 100 }], ['pointerup', { clientX: 170, clientY: 105 }]]);
  await expect(page.locator('#month_select')).toHaveValue('9');
});

test('has no horizontal overflow and keeps primary touch targets usable', async ({ page }) => {
  const viewports = [
    { width: 320, height: 568 },
    { width: 360, height: 800 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 }
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await openCalculator(page);
    const width = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(width.scroll, JSON.stringify(viewport)).toBe(width.client);
  }

  await page.setViewportSize({ width: 320, height: 568 });
  const targets = ['#prev_month', '#next_month', '#workers_decrement', '#workers_increment', '#calculate_button'];
  for (const selector of targets) {
    const box = await page.locator(selector).boundingBox();
    expect(box.width, selector).toBeGreaterThanOrEqual(44);
    expect(box.height, selector).toBeGreaterThanOrEqual(44);
  }
  await expect(page.locator('#workers')).toHaveAttribute('inputmode', 'numeric');
  expect(await page.locator('#workers').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /width=device-width/);
  await expect(page.locator('meta[name="viewport"]')).not.toHaveAttribute('content', /user-scalable=no|maximum-scale/);
});

test('removes transitions and animations for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCalculator(page);
  await page.locator('#next_month').click();
  await page.locator('#calculate_button').click();
  await expect(page.locator('#result')).toHaveClass(/success/);

  for (const selector of ['.period-summary', '#result']) {
    const motion = await page.locator(selector).evaluate((element) => {
      const style = getComputedStyle(element);
      return { animation: style.animationName, transition: style.transitionDuration };
    });
    expect(motion.animation).toBe('none');
    expect(motion.transition).toBe('0s');
  }
});
