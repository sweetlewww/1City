import os from "os";
import path from "path";
import type { Page } from "playwright";
import { client, MODEL, FALLBACK } from "./claude";
import { withPage, waitIfCaptcha } from "./browser";
import { normalizeAddress } from "./address";
import { logFriction } from "./friction";
import { PERMIT_DOCUMENTS, type PermitDraft, type Session } from "./session";
import { HOSTED, HOSTED_FILING_OFF } from "./mode";
import { getJson, locateAddress } from "./cityData";

// Garden suite building permit tools. Field map: docs/permit-flow.md
// Hard rule 6: never attach documents, never submit, never pay. There is no
// code path here that clicks "Attach" or "Submit". The fill stops on Step 6.

type Status = (msg: string) => void;

const SOURCES = {
  gardenSuites: "https://www.toronto.ca/city-government/planning-development/planning-studies-initiatives/garden-suites/",
  permitGuide:
    "https://www.toronto.ca/services-payments/building-construction/apply-for-a-building-permit/building-permit-application-guides/renovation-and-new-house-guides/new-garden-suite/",
  certifiedPlans: "https://www.toronto.ca/services-payments/building-construction/certifying-your-building-plans/",
  treeDeclaration: "https://www.toronto.ca/wp-content/uploads/2022/05/95f0-Tree-Declaration-form-2022.pdf",
  fireAccess:
    "https://www.toronto.ca/services-payments/building-construction/apply-for-a-building-permit/building-permit-application-guides/renovation-and-new-house-guides/new-garden-suite/providing-fire-department-access-to-a-new-garden-suite/",
  gardenSuiteRules: "https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter150_7.htm",
  rulesSummary: "https://www.toronto.ca/wp-content/uploads/2022/02/9320-cityplanning-garden-suites-summary-of-rules-Feb2022.pdf",
  zoningMap: "https://map.toronto.ca/maps/map.jsp?app=ZBL_CONSULT",
  heritageSearch: "https://www.toronto.ca/city-government/planning-development/heritage-preservation/heritage-register/",
};

// ---------- check_permit_requirements ----------

export async function checkPermitRequirements(project: string, address: string, status: Status) {
  status("Checking the City's permit rules on toronto.ca…");
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 6000,
    ...FALLBACK,
    output_config: { effort: "medium" },
    system: `You research City of Toronto building permit requirements using only toronto.ca. Start from the City pages listed in the request and fetch the ones you need.
Answer in plain sentences, each with a citation: does this project need a building permit; if it uses a City pre-approved (certified) plan, what that changes and what it doesn't (it still needs a building permit and a site-specific review); the required drawings, forms and fees; the Tree Declaration Form; fire access limits. Never say a project will be approved or complies. If something isn't on toronto.ca, say so.`,
    tools: [
      { type: "web_fetch_20260209", name: "web_fetch", max_uses: 6, allowed_domains: ["toronto.ca"] },
      { type: "web_search_20260209", name: "web_search", max_uses: 3, allowed_domains: ["toronto.ca"] },
    ],
    messages: [
      {
        role: "user",
        content: `Project: ${project}\nAddress (for context only): ${address}\n\nCity pages to start from:\n${Object.values(SOURCES).join("\n")}`,
      },
    ],
  });
  if (response.stop_reason === "refusal") return { error: "Could not look this up." };

  let answer = "";
  const sources = new Map<string, string>();
  for (const block of response.content) {
    if (block.type !== "text") continue;
    answer += block.text;
    for (const c of block.citations ?? []) {
      if (c.type === "web_search_result_location" && c.url.includes("toronto.ca")) sources.set(c.url, c.title ?? c.url);
      if (c.type === "char_location" && c.document_title) sources.set(c.document_title, c.document_title);
    }
  }
  return {
    answer: answer.trim(),
    cited: [...sources.keys()],
    // Mapped from the City's live application, Step 6 (docs/permit-flow.md).
    mandatory_documents: PERMIT_DOCUMENTS,
    key_sources: SOURCES,
  };
}

// ---------- lookup_zoning ----------

const ZONING_LAYER = "https://gis.toronto.ca/arcgis/rest/services/cot_geospatial11/FeatureServer/3/query";
const FORMER_BYLAW_LAYER = "https://gis.toronto.ca/arcgis/rest/services/cot_geospatial11/FeatureServer/8/query";
const BYLAW_PAGE = "https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_";

// Zone codes in By-law 569-2013 that are in the Residential zone category,
// where Chapter 150.7 permits garden suites.
const RESIDENTIAL_ZONES: Record<string, string> = {
  R: "Residential",
  RD: "Residential Detached",
  RS: "Residential Semi-Detached",
  RT: "Residential Townhouse",
  RM: "Residential Multiple Dwelling",
};

function pointQuery(lon: number, lat: number) {
  return new URLSearchParams({
    f: "json",
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "false",
  }).toString();
}

export async function lookupZoning(address: string, status: Status) {
  status(`Looking up the zoning for ${address}…`);
  const loc = await locateAddress(address);
  if (!loc.found) {
    await logFriction({ url: SOURCES.zoningMap, step: "Zoning lookup: address", problem: "Address not found exactly in the City's address service" });
    return { error: "That address wasn't found exactly.", city_suggestions: loc.suggestions };
  }

  status("Reading the City's zoning map…");
  const zoning = await getJson(`${ZONING_LAYER}?${pointQuery(loc.lon, loc.lat)}`);
  const a = zoning?.features?.[0]?.attributes;
  if (!a) {
    const former = await getJson(`${FORMER_BYLAW_LAYER}?${pointQuery(loc.lon, loc.lat)}`);
    await logFriction({ url: SOURCES.zoningMap, step: "Zoning lookup", problem: "Lot not covered by the city-wide zoning map layer" });
    return {
      matched_address: loc.address,
      zone: null,
      note: former?.features?.length
        ? "This lot is still under a former City of Toronto zoning by-law, not the city-wide By-law 569-2013. Its zoning has to be confirmed with Toronto Building."
        : "The City's zoning map has no zone for this point. Its zoning has to be confirmed with Toronto Building.",
      source_url: SOURCES.zoningMap,
    };
  }

  const zoneCode = String(a.ZN_ZONE ?? "");
  const residential = RESIDENTIAL_ZONES[zoneCode];
  return {
    matched_address: loc.address,
    zone: a.ZN_STRING, // e.g. "R (d0.6) (x737)"
    zone_name: residential ?? zoneCode,
    residential_zone_category: !!residential,
    garden_suites_rule: residential
      ? "Chapter 150.7 of Zoning By-law 569-2013 permits garden suites on lots in the Residential zone category, subject to its size, setback, height and lot rules."
      : "This is not a Residential zone. Chapter 150.7 permits garden suites only in the Residential zone category.",
    site_specific_exception: a.ZN_EXCPTN === "Y" ? `Exception ${a.ZN_EXCPTN_NO}: may add or change rules for this lot.` : null,
    holding_provision: a.ZN_HOLDING === "Y" ? "Holding provision applies." : null,
    sources: {
      zoning_map: SOURCES.zoningMap,
      zone_rules: a.BYLAW_SECTIONLINK ? BYLAW_PAGE + a.BYLAW_SECTIONLINK : null,
      exception: a.BYLAW_EXCPTNLINK ? BYLAW_PAGE + a.BYLAW_EXCPTNLINK : null,
      garden_suite_rules: SOURCES.gardenSuiteRules,
      rules_summary: SOURCES.rulesSummary,
    },
    reminder: "Zoning shown is from the City's map. Whether this project meets every rule is decided by Toronto Building in the site-specific review.",
  };
}

// ---------- prepare_permit_application ----------

const APP_URL =
  "https://www.toronto.ca/services-payments/building-construction/apply-for-a-building-permit/express-building-permits/express-building-permits-application/?appType=SR&subtopic=22001#submit";

const SEL = {
  address: "#js_input__addressA_property_address",
  description: "#projectDescription",
  openOrdersAck: "#OpenOrderViolations_0",
  heritageNo: "#HeritageDesignation_1",
  coaNoticeNo: "#preScreenZoningIssues_1",
  designer: {
    "Home Owner/Qualified BCIN Designer": "#srDesignResponse_0",
    "Professional Engineer/Architect registered in Ontario": "#srDesignResponse_1",
    Both: "#srDesignResponse_2",
  },
  zap: { Yes: "#zapCertificate_0", No: "#zapCertificate_1" },
  partyWallAck: "#partyWall_0",
  fullName: "#applicant_fullName",
  corporation: "#applicant_corporation_partnership",
  phone: "#applicant_phone",
  email: "#applicant_email",
};

export type PermitInput = {
  draft_id?: string;
  address?: string;
  project_description?: string;
  heritage_property?: "Yes" | "No" | "Unknown";
  designer?: PermitDraft["designer"];
  zap_certificate?: "Yes" | "No";
  full_name?: string;
  phone?: string;
  email?: string;
  corporation?: string;
  documents_have?: string[];
};

export async function preparePermitApplication(input: PermitInput, session: Session, status: Status) {
  // Second call, after "yes": fill the City's form.
  if (input.draft_id) {
    const draft = session.permitDraft;
    if (!draft || draft.id !== input.draft_id) return { error: "No matching permit draft. Prepare it again." };
    if (session.confirmedDraftId !== draft.id) {
      return { error: 'Not confirmed. Show the summary and wait for the resident to type "yes".' };
    }
    session.confirmedDraftId = undefined;
    if (HOSTED) {
      return { ok: true, hosted_demo: true, filled_city_form: false, message: HOSTED_FILING_OFF, checklist: buildChecklist(draft, true) };
    }
    const result = await fillApplication(draft, status);
    if (result.ok) draft.prepared = true;
    return result;
  }

  // First call: check the details and build the summary.
  const clean = (s?: string) => (s ?? "").trim();
  const missing: string[] = [];
  if (!clean(input.address)) missing.push("property address");
  if (!clean(input.project_description)) missing.push("project description");
  if (input.heritage_property === "Yes") {
    return {
      ready: false,
      blocked: "Designated heritage properties can't use the City's online express application. The City asks for these by email at bldapplications@toronto.ca.",
      source: SOURCES.permitGuide,
    };
  }
  if (input.heritage_property !== "No") missing.push(`whether it's a designated heritage property (check: ${SOURCES.heritageSearch})`);
  if (!input.designer) missing.push("who takes responsibility for the design (owner or BCIN designer, engineer or architect, or both)");
  if (!input.zap_certificate) missing.push("whether they already have a Zoning Applicable Law (ZAP) certificate");
  if (!clean(input.full_name)) missing.push("applicant full name");
  if (!/^\D*(\d\D*){10}$/.test(clean(input.phone))) missing.push("a 10-digit phone number");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean(input.email))) missing.push("an email address");
  if (clean(input.project_description).length > 2000) missing.push("a shorter project description (the City allows 2000 characters)");
  if (missing.length) {
    session.permitDraft = undefined;
    return { ready: false, missing };
  }

  const have = PERMIT_DOCUMENTS.filter((d) => (input.documents_have ?? []).includes(d));
  const draft: PermitDraft = {
    id: `p${Date.now().toString(36)}`,
    address: clean(input.address),
    project_description: clean(input.project_description),
    heritage: "No",
    committee_of_adjustment_notice: "No",
    designer: input.designer!,
    zap_certificate: input.zap_certificate!,
    applicant: {
      full_name: clean(input.full_name),
      phone: clean(input.phone).replace(/\D/g, ""),
      email: clean(input.email),
      corporation: clean(input.corporation) || undefined,
    },
    documents_have: have,
  };
  session.permitDraft = draft;
  session.awaitingYes = draft.id;

  const summary = [
    "Garden suite building permit application (City of Toronto, Express Building Permits)",
    `Property: ${draft.address}`,
    `Project: ${draft.project_description}`,
    "Designated heritage property: No",
    "Committee of Adjustment notice wanted: No",
    `Design responsibility: ${draft.designer}`,
    `Zoning Applicable Law certificate: ${draft.zap_certificate}`,
    `Applicant: ${draft.applicant.full_name}, ${input.phone}, ${draft.applicant.email}`,
    "",
    "I'll fill in the City's form up to its last step (documents) and stop. I won't attach files, submit, or pay anything.",
    'Typing "yes" also means you confirm the City\'s two acknowledgments on the form: open orders or violations on the property send the application to the regular (slower) stream, and any work on a shared party wall needs its own party wall permit.',
  ].join("\n");

  return { ready: true, draft_id: draft.id, summary, instructions: 'Show this summary exactly, then ask the resident to type "yes" to start the application, or tell you what to change.' };
}

/** The done-and-missing checklist. In the hosted demo nothing was typed into the City's form. */
function buildChecklist(draft: PermitDraft, hosted: boolean) {
  return {
    done_by_1city: hosted
      ? ["Checked the permit rules and zoning", "Collected every answer the City's application asks for (Steps 1 to 5)"]
      : [
          "Step 1: property address entered and confirmed",
          "Step 2: project description",
          "Step 3: pre-screening answers (not heritage, no Committee of Adjustment notice)",
          "Step 4: design responsibility, ZAP certificate answer, party wall acknowledgment",
          "Step 5: applicant contact details",
        ],
    documents_resident_has: draft.documents_have,
    documents_missing: PERMIT_DOCUMENTS.filter((d) => !draft.documents_have.includes(d)),
    document_sources: {
      "Tree Declaration Form (Urban Forestry)": SOURCES.treeDeclaration,
      "All required drawings and forms": SOURCES.permitGuide,
      "Pre-approved (certified) plans": SOURCES.certifiedPlans,
    },
    still_to_do_by_resident: [
      ...(hosted
        ? [
            "Open the City's Express Building Permits application and enter the answers above (on Mike's laptop, 1City fills Steps 1 to 5 for you)",
            "Attach the PDFs, with all drawings combined into one PDF",
          ]
        : ["Attach the PDFs (all drawings combined into one PDF) in the open browser window"]),
      "Sign in and submit when ready (the City may ask for a myToronto login at submit)",
      "Pay the permit fee when the City invoices it",
    ],
    who_reviews:
      "Toronto Building staff review the application in the Express Building Permits stream. A pre-approved plan still gets a site-specific review (siting, zoning, trees, fire access, servicing). City staff decide.",
  };
}

type FillResult =
  | { ok: true; stopped_at: string; checklist: object }
  | { ok: false; step: string; error: string };

async function fillApplication(draft: PermitDraft, status: Status): Promise<FillResult> {
  let step = "Open application";
  try {
    return await withPage(
      async (page) => {
        status("Opening the City's building permit application…");
        await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
        await page.locator(SEL.address).waitFor({ timeout: 25_000 });
        await waitIfCaptcha(page, "Permit: page load", status);

        step = "Step 1: Address";
        status(`Step 1 of 6: entering the property address (${draft.address})…`);
        await page.locator(SEL.address).click();
        await page.locator(SEL.address).fill("");
        await page.locator(SEL.address).pressSequentially(draft.address, { delay: 50 });
        await page.locator(SEL.address).press("Enter");
        await page.locator("text=Selected Address").first().waitFor({ timeout: 15_000 });
        const selected = ((await page.evaluate(() => document.body.innerText)).split("Selected Address")[1] ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
        if (normalizeAddress(selected) !== normalizeAddress(draft.address)) {
          throw new Error(`The City's form selected "${selected}", not "${draft.address}".`);
        }
        await next(page, status, "Step 2");

        step = "Step 2: Project Description";
        status("Step 2 of 6: describing the project…");
        await page.fill(SEL.description, draft.project_description);
        await next(page, status, "Step 3");

        step = "Step 3: Pre-screening Questions";
        status("Step 3 of 6: pre-screening questions…");
        await page.locator(SEL.openOrdersAck).check();
        await page.locator(SEL.heritageNo).check();
        await page.locator(SEL.coaNoticeNo).check();
        await next(page, status, "Step 4");

        step = "Step 4: Application Screening Questions";
        status("Step 4 of 6: screening questions…");
        await page.locator(SEL.designer[draft.designer]).check();
        await page.locator(SEL.zap[draft.zap_certificate]).check();
        await page.locator(SEL.partyWallAck).check();
        await next(page, status, "Step 5");

        step = "Step 5: Applicant Details";
        status("Step 5 of 6: applicant details…");
        await page.fill(SEL.fullName, draft.applicant.full_name);
        if (draft.applicant.corporation) await page.fill(SEL.corporation, draft.applicant.corporation);
        await page.fill(SEL.phone, draft.applicant.phone);
        await page.fill(SEL.email, draft.applicant.email);
        for (const [sel, want] of [[SEL.fullName, draft.applicant.full_name], [SEL.email, draft.applicant.email]] as const) {
          if ((await page.locator(sel).inputValue()).trim() !== want) throw new Error(`A field didn't take the value we typed (${sel}).`);
        }
        await next(page, status, "Step 6");

        step = "Step 6: Add Application Documents";
        status("Step 6 of 6: reached the documents step. Stopping here: nothing attached, nothing submitted.");
        await page.locator("text=Upload Application Documents").first().waitFor({ timeout: 15_000 });
        await page.screenshot({ path: path.join(os.tmpdir(), `1city-${draft.id}-permit-step6.png`), fullPage: true });

        return {
          ok: true as const,
          stopped_at: "Step 6 of 6: Add Application Documents. The City's Submit button is on this page; 1City did not touch it.",
          checklist: buildChecklist(draft, false),
        };
      },
      // Leave the application open on the documents step so it can be seen and finished by a person.
      { keepOpen: true },
    );
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).split("\n")[0];
    await logFriction({ url: APP_URL.split("#")[0], step: `Permit: ${step}`, problem: message.slice(0, 200) });
    return { ok: false, step, error: message };
  }
}

/** Click the visible "Next" button and wait for the given step heading. Never clicks anything else. */
async function next(page: Page, status: Status, stepHeading: string) {
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const arrived = await page
    .locator("h1", { hasText: stepHeading })
    .first()
    .waitFor({ timeout: 20_000 })
    .then(() => true, () => false);
  if (arrived) return;
  await waitForLoginIfAsked(page, status, stepHeading);
  const errors = await page.evaluate(() =>
    [...document.querySelectorAll("[class*=error], [role=alert]")]
      .filter((e) => (e as HTMLElement).offsetParent && (e as HTMLElement).innerText.trim())
      .map((e) => (e as HTMLElement).innerText.trim())
      .slice(0, 3),
  );
  if (!(await page.locator("h1", { hasText: stepHeading }).first().isVisible().catch(() => false))) {
    throw new Error(errors.length ? `The City's form said: ${errors.join(" / ")}` : `The form didn't move to ${stepHeading}.`);
  }
}

/** Hard rule 6: if the City asks for a login, a person signs in. Wait up to 5 minutes. */
async function waitForLoginIfAsked(page: Page, status: Status, stepHeading: string) {
  const loginShown = (await page.locator('input[type="password"]').count()) > 0 || !page.url().includes("www.toronto.ca/services-payments");
  if (!loginShown) return;
  await logFriction({ url: page.url().split("?")[0], step: "Permit: login", problem: "Login wall appeared; handed control to a person" });
  status("The City is asking for a myToronto sign-in. Please sign in in the browser window. I'll wait.");
  await page.bringToFront();
  await page.locator("h1", { hasText: stepHeading }).first().waitFor({ timeout: 5 * 60_000 });
}
