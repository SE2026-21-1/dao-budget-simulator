import assert from 'node:assert/strict';

// Only keyboard input drives focus/actions. evaluate() observes DOM and computed style.
export async function verifyKeyboard(page, { uiBase, width, recipient, report, screenshot }) {
  const result = { width, height: width === 390 ? 844 : 900, steps: [] };
  (report.keyboard ??= []).push(result);
  await page.setViewportSize({ width, height: result.height });
  await page.goto(`${uiBase}/proposals/new`);
  await page.locator('#proposal-title').waitFor();
  const focus = () => page.evaluate(() => {
    const e = document.activeElement, s = getComputedStyle(e), r = e.getBoundingClientRect();
    return { tag: e.tagName, id: e.id, text: e.textContent?.trim().slice(0, 100),
      href: e.getAttribute('href'), focusVisible: e.matches(':focus-visible'),
      outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, boxShadow: s.boxShadow,
      x: r.x, y: r.y, width: r.width, height: r.height, viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth };
  });
  const visibleFocus = async label => {
    await page.waitForFunction(() => {
      const r = document.activeElement.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
    });
    const state = await focus();
    assert.equal(state.focusVisible, true, `${label}: keyboard focus must remain visible`);
    assert.ok((state.outlineStyle !== 'none' && parseFloat(state.outlineWidth) > 0) || state.boxShadow !== 'none',
      `${label}: missing visible focus indicator`);
    result.steps.push({ label, ...state });
    return state;
  };
  async function tabTo(selector, reverse = false) {
    for (let tabs = 1; tabs <= 80; tabs++) {
      await page.keyboard.press(reverse ? 'Shift+Tab' : 'Tab');
      if (await page.locator(selector).evaluate(e => e === document.activeElement)) {
        result.steps.push({ target: selector, tabs, reverse });
        return;
      }
    }
    throw new Error(`Keyboard cannot reach ${selector}`);
  }
  await page.keyboard.press('Tab');
  assert.equal((await focus()).href, '#main-content', 'Skip link must be the first keyboard stop');
  await visibleFocus('skip-link');
  await screenshot(page, `keyboard-${width}-skip-link`);
  await page.keyboard.press('Enter');
  assert.equal((await focus()).id, 'main-content', 'Enter must activate the native skip link');
  await tabTo('#proposal-title');
  await visibleFocus('title');
  await page.keyboard.press('Shift+Tab');
  assert.notEqual((await focus()).id, 'proposal-title');
  await page.keyboard.press('Tab');
  assert.equal((await focus()).id, 'proposal-title', 'Shift+Tab/Tab must restore the previous field');
  await page.keyboard.type(`QA07 keyboard ${width}`);
  await page.keyboard.press('Tab');
  assert.equal((await focus()).id, 'proposal-body');
  await page.keyboard.type('Keyboard-only proposal draft with retained text and accessible controls.');
  await page.keyboard.press('Tab');
  assert.equal((await focus()).id, 'proposal-recipient');
  await page.keyboard.type(recipient);
  await page.keyboard.press('Tab');
  assert.equal((await focus()).id, 'proposal-amount');
  await page.keyboard.type('1000');
  await page.keyboard.press('Tab');
  assert.equal((await focus()).text, 'Tiếp tục: xem lại');
  await visibleFocus('review-button');
  await screenshot(page, `keyboard-${width}-form`);
  await page.keyboard.press('Space');
  await page.getByRole('region', { name: 'Xem lại đề xuất' }).waitFor();
  assert.equal(await page.locator('#proposal-amount').inputValue(), '1000');
  await tabTo('button:text-is("Chỉnh sửa")');
  await visibleFocus('edit-button');
  await page.keyboard.press('Enter');
  assert.equal(await page.getByRole('region', { name: 'Xem lại đề xuất' }).count(), 0);
  assert.equal(await page.locator('#proposal-title').inputValue(), `QA07 keyboard ${width}`);
  assert.equal(await page.locator('#proposal-recipient').inputValue(), recipient);
  await tabTo('nav[aria-label="Điều hướng sidebar"] a[href="/proposals"]');
  await visibleFocus('proposal-navigation');
  await page.keyboard.press('Enter');
  await page.waitForURL(`${uiBase}/proposals`);
  await screenshot(page, `keyboard-${width}-navigation`);
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(dimensions.scrollWidth <= dimensions.viewport, 'Keyboard navigation view must not overflow horizontally');
  result.dimensions = dimensions;
  result.status = 'PASS';
}
