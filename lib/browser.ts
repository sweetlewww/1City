import { chromium, type Browser, type Page } from "playwright";
import { logFriction } from "./friction";
import { HOSTED } from "./mode";
import { normalizeAddress } from "./address";

export { normalizeAddress };

// One visible Chrome window, shared by every tool. Uses the Google Chrome
// already installed on the Mac, so no extra browser download is needed.
// Only one page action runs at a time (hard rule 4: no parallel sessions).

const g = globalThis as unknown as { __browser?: Browser; __browserLock?: Promise<unknown> };

async function getBrowser(): Promise<Browser> {
  if (g.__browser?.isConnected()) return g.__browser;
  // First run, or someone closed the Chrome window: start a fresh one.
  g.__browser = await chromium.launch({
    channel: "chrome",
    headless: false,
    slowMo: 300,
    args: ["--window-size=1280,900"],
  });
  return g.__browser;
}

/**
 * Run one browser task at a time in a fresh tab, closing the tab afterwards
 * (or leaving it open with keepOpen, until the next browser task starts).
 */
export async function withPage<T>(task: (page: Page) => Promise<T>, opts: { keepOpen?: boolean } = {}): Promise<T> {
  // Safety net: the hosted demo has no screen and must never drive the City's site.
  if (HOSTED) throw new Error("The hosted demo doesn't open a browser.");
  const previous = g.__browserLock ?? Promise.resolve();
  const run = previous.catch(() => {}).then(async () => {
    const browser = await getBrowser();
    const context = browser.contexts()[0] ?? (await browser.newContext({ viewport: { width: 1280, height: 860 } }));
    for (const old of context.pages()) await old.close().catch(() => {});
    const page = await context.newPage();
    try {
      return await task(page);
    } finally {
      // keepOpen also leaves a failed page up, so a person can see it and take over.
      if (!opts.keepOpen) await page.close().catch(() => {});
    }
  });
  g.__browserLock = run;
  return run;
}

/**
 * If a CAPTCHA puzzle is showing, do not try to solve it (hard rule 3).
 * Log it, then wait for Mike to finish it by hand in the visible window.
 */
export async function waitIfCaptcha(page: Page, step: string, onWaiting?: (msg: string) => void) {
  const challengeVisible = async () =>
    page
      .locator('iframe[src*="recaptcha/api2/bframe"], iframe[title*="challenge"]')
      .first()
      .isVisible()
      .catch(() => false);

  if (!(await challengeVisible())) return;

  await logFriction({ url: page.url(), step, problem: "CAPTCHA challenge appeared; handed control to a person" });
  onWaiting?.("The City's site is showing a CAPTCHA. Please solve it in the browser window. I'll wait.");
  await page.bringToFront();
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    if (!(await challengeVisible())) return;
  }
  throw new Error("CAPTCHA was not completed within 5 minutes.");
}

/**
 * The City's address boxes (311 form and collection schedule) share one
 * typeahead. Type the address, read the suggestions, and pick one that
 * actually matches. The first suggestion is often a different street.
 */
export async function pickAddress(page: Page, inputSelector: string, address: string) {
  const input = page.locator(inputSelector);
  await input.click();
  await input.fill("");
  await input.pressSequentially(address, { delay: 60 });
  const items = page.locator('[role="listbox"] li[id^="typeahead-listbox--item__"]');
  const appeared = () =>
    items.first().waitFor({ state: "visible", timeout: 10_000 }).then(() => true, () => false);
  if (!(await appeared())) {
    // The list sometimes doesn't open. Nudge the box once and wait again.
    await input.press("Backspace");
    await input.pressSequentially(address.slice(-1), { delay: 60 });
    await appeared();
  }
  const suggestions = (await items.allInnerTexts()).map((s) => s.trim()).filter(Boolean);

  const norm = normalizeAddress;
  const wanted = norm(address);
  const index = suggestions.findIndex((s) => norm(s) === wanted || norm(s).startsWith(wanted));

  if (index === -1) return { picked: null, suggestions };
  await items.nth(index).click();
  return { picked: suggestions[index], suggestions };
}

