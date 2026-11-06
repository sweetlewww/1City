import os from "os";
import path from "path";
import type { Page } from "playwright";
import { withPage, waitIfCaptcha, pickAddress } from "./browser";
import { logFriction } from "./friction";
import { normalizeAddress } from "./address";
import type { PotholeDraft } from "./session";

// The one function that files a request with the City. Today it drives the
// 311 web form in a visible browser. When Open311 API access arrives, swap
// the body of submitServiceRequest() for an API call and nothing else changes.
// Field map: docs/pothole-flow.md

export const DRY_RUN = process.env.DRY_RUN !== "false";

const FORM_URL =
  "https://www.toronto.ca/home/311-toronto-at-your-service/create-a-service-request/service-request/?request=0VS6g000000DzbXGAS";

const SEL = {
  concern: "#a0K6g000009yWuXEAU",
  torontoIslandNo: "#a0K6g000009yWjhEAE_1",
  roadNotExpressway: "#a0K6g000009yWjiEAE_0",
  bikeLaneNo: "#a0K6g00000GSUHbEAP_1",
  termsConsent: "#declarationconsent_0",
  address: "#address",
  exactLocation: "#a0K6g00000H9GaKEAV",
  sizeDepth: "#a0K6g000009yWa6EAE",
  majorRoad: "#a0KVt00000FIaf4MAD",
  additionalInfo: 'textarea[id^="additionalInformation--"]',
  fileInput: 'input[type="file"]',
  anonymous: '[id$="--anonymousCheck_0"]',
  firstName: '[id$="--C311_First_Name__c"]',
  lastName: '[id$="--C311_Last_Name__c"]',
  email: '[id$="--C311_Email__c"]',
  emailUpdates: '[id$="--C311_Preferred_Notification_Channels__c_1"]',
  next: "#js-button__next",
};

export type SubmitResult =
  | { ok: true; dry_run: true; review_summary: string; screenshot: string }
  | { ok: true; dry_run: false; tracking_number: string | null; confirmation_text: string; screenshot: string }
  | { ok: false; step: string; error: string; city_suggestions?: string[] };

class StepError extends Error {
  constructor(public step: string, message: string, public extra?: { city_suggestions?: string[] }) {
    super(message);
  }
}

export async function submitServiceRequest(draft: PotholeDraft, status: (m: string) => void): Promise<SubmitResult> {
  let step = "Open form";
  try {
    return await withPage(
      async (page) => {
        status("Opening the City's 311 pothole form…");
        await page.goto(FORM_URL, { waitUntil: "domcontentloaded" });
        await page.locator(SEL.concern).waitFor({ timeout: 20_000 });
        await waitIfCaptcha(page, "311 form: page load", status);

        step = "Step 1: Concern";
        status("Step 1 of 5: choosing “Road Pothole”…");
        await page.selectOption(SEL.concern, { label: "Road Pothole" });
        await page.getByRole("button", { name: "Continue" }).click();

        step = "Step 1: Confirm the Following";
        status("Step 1 of 5: answering the City's screening questions…");
        await page.getByRole("button", { name: "Start your Request" }).waitFor({ timeout: 20_000 });
        await page.locator(SEL.torontoIslandNo).check();
        await page.locator(SEL.roadNotExpressway).check();
        await page.locator(SEL.bikeLaneNo).check();
        await page.getByRole("button", { name: "Start your Request" }).click();

        // The resident agreed to these terms by typing "yes" to a summary that says so.
        step = "Step 1: Terms of Use";
        status("Step 1 of 5: accepting the City's 311 Terms of Use…");
        await page.locator(SEL.termsConsent).waitFor({ timeout: 20_000 });
        await page.locator(SEL.termsConsent).check();
        await next(page, step, SEL.address);

        step = "Step 2: Location";
        status(`Step 2 of 5: entering the location (${draft.location})…`);
        const { picked, suggestions } = await pickAddress(page, SEL.address, draft.location);
        if (!picked) {
          throw new StepError(step, `The City's map search has no exact match for "${draft.location}".`, {
            city_suggestions: suggestions,
          });
        }
        await confirmSelectedAddress(page, step, draft.location, status);
        // The City places the pin on its map after the pick; let that finish.
        await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(1000);
        await next(page, step, SEL.exactLocation);

        step = "Step 3: Request Details";
        status("Step 3 of 5: describing the pothole…");
        await page.fill(SEL.exactLocation, draft.exact_location);
        await page.fill(SEL.sizeDepth, draft.size_depth);
        await page.selectOption(SEL.majorRoad, { label: draft.major_road });
        await page.waitForTimeout(800);
        // Follow-up question that only shows up for some answers.
        await answerByLabel(page, /shoe ?box/i, draft.shoebox_or_larger);
        if (draft.additional_info) await page.locator(SEL.additionalInfo).first().fill(draft.additional_info);
        const checks: [string, string][] = [
          [SEL.exactLocation, draft.exact_location],
          [SEL.sizeDepth, draft.size_depth],
        ];
        if (draft.additional_info) checks.push([SEL.additionalInfo, draft.additional_info]);
        if (draft.photo_path) {
          status("Step 3 of 5: uploading the photo…");
          await page.locator(SEL.fileInput).first().setInputFiles(draft.photo_path);
          await page.waitForTimeout(1500);
        }
        await readBack(page, step, checks);
        await next(page, step, SEL.anonymous);

        step = "Step 4: Contact";
        status("Step 4 of 5: contact details…");
        if (draft.contact.mode === "anonymous") {
          await page.locator(SEL.anonymous).check();
        } else {
          await page.fill(SEL.firstName, draft.contact.first_name);
          await page.fill(SEL.lastName, draft.contact.last_name);
          await page.fill(SEL.email, draft.contact.email);
          if (draft.contact.email_updates) await page.locator(SEL.emailUpdates).check();
          await readBack(page, step, [[SEL.email, draft.contact.email]]);
        }
        // No retry here: on the review screen the same button is "Submit Request".
        await next(page, step, "text=Summary of your request", false);

        step = "Step 5: Review";
        status("Step 5 of 5: checking the City's review screen…");
        const review = await reviewText(page);
        if (!review.includes(draft.exact_location.slice(0, 40))) {
          throw new StepError(step, "The review screen doesn't show the details we entered.");
        }
        const shot = path.join(os.tmpdir(), `1city-${draft.id}-review.png`);
        await page.screenshot({ path: shot, fullPage: true });

        if (DRY_RUN) {
          status("Dry run: stopped at the review screen. Nothing was submitted.");
          return { ok: true as const, dry_run: true as const, review_summary: review, screenshot: shot };
        }

        step = "Submit";
        status("Submitting to the City…");
        await page.locator(SEL.next).click(); // labelled "Submit Request" on this step
        await waitIfCaptcha(page, "311 form: submit", status);
        await page.waitForFunction(() => !document.body.innerText.includes("Summary of your request"), null, {
          timeout: 60_000,
        });
        await page.waitForTimeout(2000);
        await waitIfCaptcha(page, "311 form: after submit", status);
        const text = (await page.evaluate(() => document.querySelector("main")?.innerText ?? document.body.innerText)).slice(0, 3000);
        const done = path.join(os.tmpdir(), `1city-${draft.id}-confirmation.png`);
        await page.screenshot({ path: done, fullPage: true });
        const tracking = findTrackingNumber(text);
        if (!tracking) {
          await logFriction({ url: page.url(), step: "Confirmation", problem: "No tracking number found on the confirmation screen" });
        }
        return { ok: true as const, dry_run: false as const, tracking_number: tracking, confirmation_text: text, screenshot: done };
      },
      // Leave the review or confirmation screen open so it can be seen (and filmed).
      { keepOpen: true },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stepName = err instanceof StepError ? err.step : step;
    await logFriction({ url: FORM_URL, step: `311 form: ${stepName}`, problem: message.split("\n")[0].slice(0, 200) });
    return {
      ok: false,
      step: stepName,
      error: message.split("\n")[0],
      city_suggestions: err instanceof StepError ? err.extra?.city_suggestions : undefined,
    };
  }
}

/** Click Next, then wait for the next step. If the City shows a validation error instead, report it. */
async function next(page: Page, step: string, waitFor: string, allowRetry = true) {
  const arrivedAfterClick = async (timeout: number) => {
    await page.locator(SEL.next).click();
    return page.locator(waitFor).first().waitFor({ timeout }).then(() => true, () => false);
  };
  if (await arrivedAfterClick(15_000)) return;
  if (!allowRetry) throw new StepError(step, "The form didn't move to the next step.");
  // Sometimes the first click lands while the page is still busy. Try once more.
  await page.waitForTimeout(2000);
  if (await page.locator(waitFor).first().isVisible().catch(() => false)) return;
  if (await arrivedAfterClick(15_000)) return;

  await page.screenshot({ path: path.join(os.tmpdir(), `1city-failed-${step.replace(/\W+/g, "-")}-${Date.now()}.png`), fullPage: true }).catch(() => {});
  const errors = await page.evaluate(() =>
    [...document.querySelectorAll("[class*=error], [role=alert]")]
      .filter((e) => (e as HTMLElement).offsetParent && (e as HTMLElement).innerText.trim())
      .map((e) => (e as HTMLElement).innerText.trim())
      .slice(0, 3),
  );
  throw new StepError(step, errors.length ? `The City's form said: ${errors.join(" / ")}` : "The form didn't move to the next step.");
}

/**
 * Answer a Yes/No question found by its wording, if it's on screen. The City
 * renders these as a dropdown or as radio buttons, so handle both.
 */
async function answerByLabel(page: Page, question: RegExp, answer: "Yes" | "No") {
  const select = page.getByLabel(question).and(page.locator("select"));
  if (await select.count()) {
    if (await select.first().isVisible()) await select.first().selectOption({ label: answer });
    return;
  }
  const group = page.locator("fieldset", { hasText: question });
  if ((await group.count()) && (await group.first().isVisible())) {
    await group.first().getByRole("radio", { name: answer, exact: true }).check();
  }
}

/**
 * Clicking a suggestion doesn't always register with the City's form ("Please
 * select an address"). If it hasn't after a few seconds, click the City's own
 * Find Address button: the box now holds the exact suggestion text. Either way,
 * check the address the City selected is the one we meant before going on.
 */
async function confirmSelectedAddress(page: Page, step: string, wanted: string, status: (m: string) => void) {
  const selected = page.locator("text=Selected Address").first();
  let ok = await selected.waitFor({ timeout: 6_000 }).then(() => true, () => false);
  if (!ok) {
    await page.getByRole("button", { name: "Find Address" }).first().click();
    status("Step 2 of 5: waiting for the City's address check…");
    ok = await selected.waitFor({ timeout: 30_000 }).then(() => true, () => false);
  }
  if (!ok) {
    // The City's "Validating Address" check can hang. Hand over to a person.
    await logFriction({ url: page.url(), step: "311 form: Step 2: Location", problem: "City's 'Validating Address' check hung; handed to a person to pick the address" });
    status(`The City's address check is stuck. Please pick "${wanted}" from the list in the browser window yourself. I'll wait.`);
    await page.bringToFront();
    ok = await selected.waitFor({ timeout: 3 * 60_000 }).then(() => true, () => false);
  }
  if (!ok) throw new StepError(step, "The City's form didn't accept the address. Nothing was filed.");

  const shown = ((await page.evaluate(() => document.body.innerText)).split("Selected Address")[1] ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean) ?? "";
  if (normalizeAddress(shown) !== normalizeAddress(wanted)) {
    throw new StepError(step, `The City's form selected "${shown}", not "${wanted}". Nothing was filed.`);
  }
}

/** A fill can silently fail. Check each value actually landed. */
async function readBack(page: Page, step: string, pairs: [string, string][]) {
  for (const [sel, expected] of pairs) {
    const actual = await page.locator(sel).first().inputValue();
    if (actual.trim() !== expected.trim()) throw new StepError(step, `A field didn't take the value we typed (${sel}).`);
  }
}

async function reviewText(page: Page) {
  const text = await page.evaluate(() => document.body.innerText);
  return (text.split("Summary of your request")[1] ?? "").split("Previous")[0].trim().slice(0, 2000);
}

// The City's reference numbers look like 10001234 (8 digits, per its tracking page).
function findTrackingNumber(text: string): string | null {
  const labelled = text.match(/(?:reference|request|tracking|confirmation)\s*(?:number|#|no\.?)?\s*(?:is)?\s*[:#]?\s*(\d{7,10})\b/i);
  if (labelled) return labelled[1];
  const bare = text.match(/\b\d{8}\b/);
  return bare ? bare[0] : null;
}
