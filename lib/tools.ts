import type Anthropic from "@anthropic-ai/sdk";
import { client, MODEL, FALLBACK } from "./claude";
import { withPage, waitIfCaptcha, pickAddress } from "./browser";
import { logFriction } from "./friction";
import { deletePhoto, type PotholeDraft, type Session } from "./session";
import { DRY_RUN, submitServiceRequest } from "./submit";
import { HOSTED, HOSTED_FILING_OFF } from "./mode";
import { garbageScheduleFromData, SCHEDULE_URL } from "./cityData";
import { checkPermitRequirements, lookupZoning, preparePermitApplication, type PermitInput } from "./permit";
import { PERMIT_DOCUMENTS } from "./session";

type Status = (msg: string) => void;

// ---------- Tool definitions the chat agent sees ----------

export const TOOL_DEFS: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_city_info",
    description:
      "Look up an answer to a City of Toronto question on toronto.ca. Returns the answer text and the toronto.ca source URLs it came from. Use this for any general 311 question (bins, permits, fees, rules, how-to).",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The resident's question, rewritten as a clear search question." },
      },
      required: ["question"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "lookup_address_service",
    description:
      "Look up an address-based City service on toronto.ca in the visible browser. Currently supports service='garbage_schedule' (next collection day and what goes out). Needs a street address with number and street type, e.g. '20 Withrow St'.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Street address, e.g. '20 Withrow St'. No unit numbers." },
        service: { type: "string", enum: ["garbage_schedule"] },
      },
      required: ["address", "service"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "draft_service_request",
    description:
      "Prepare a 311 service request (only type 'pothole' for now) and get back a plain summary to show the resident. Call it once you have every field; if anything is missing it returns the list of missing fields so you can ask. Calling it again replaces the previous draft. Leave unknown fields null.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["pothole"] },
        location: {
          type: ["string", "null"],
          description: "Street address or intersection the City's map can find, e.g. '100 Queen St W' or 'Queen St W and Bay St'.",
        },
        exact_location: {
          type: ["string", "null"],
          description: "Where exactly on the road: side of the road, distance from the intersection, landmarks. Max 255 characters.",
        },
        size_depth: { type: ["string", "null"], description: "Size and depth of the pothole in the resident's words. Max 255 characters." },
        major_road: { anyOf: [{ type: "string", enum: ["Yes", "No"] }, { type: "null" }], description: "Is it on a major road? Ask the resident." },
        shoebox_or_larger: {
          anyOf: [{ type: "string", enum: ["Yes", "No"] }, { type: "null" }],
          description: "Is the pothole the size of a shoe box or larger? Usually clear from the size given (a shoe box is about 30 cm long); ask only if it isn't.",
        },
        additional_info: { type: ["string", "null"], description: "Anything else the resident wants the crew to know. Optional." },
        include_photo: { type: "boolean", description: "True if the resident attached a photo in this chat and wants it included." },
        contact_mode: {
          anyOf: [{ type: "string", enum: ["anonymous", "contact"] }, { type: "null" }],
          description: "'anonymous', or 'contact' if the resident wants to give a name and email (needed for email status updates).",
        },
        first_name: { type: ["string", "null"] },
        last_name: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        email_updates: { type: ["boolean", "null"], description: "Resident wants email status updates from the City." },
      },
      required: [
        "type", "location", "exact_location", "size_depth", "major_road", "shoebox_or_larger", "additional_info",
        "include_photo", "contact_mode", "first_name", "last_name", "email", "email_updates",
      ],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "submit_service_request",
    description:
      "File the drafted request with the City by filling the official 311 web form in the visible browser. Only works right after the resident typed \"yes\" to the summary of this exact draft; otherwise it refuses. Returns the tracking number.",
    input_schema: {
      type: "object",
      properties: { draft_id: { type: "string" } },
      required: ["draft_id"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "check_permit_requirements",
    description:
      "Find out from toronto.ca whether a building project needs a permit and what the application requires (drawings, forms, fees, tree declaration, fire access), with source links. Also returns the City's list of mandatory upload documents.",
    input_schema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Plain description, e.g. 'garden suite in the backyard using a City pre-approved (certified) plan'." },
        address: { type: "string" },
      },
      required: ["project", "address"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "lookup_zoning",
    description:
      "Look up a property's zoning on the City's zoning map (By-law 569-2013): zone string, whether it's in the Residential zone category where garden suites are permitted, any site-specific exception, and links to the by-law sections.",
    input_schema: {
      type: "object",
      properties: { address: { type: "string", description: "Street address, e.g. '100 Quebec Ave'." } },
      required: ["address"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "prepare_permit_application",
    description:
      "Garden suite building permit application on the City's Express Building Permits form. First call (no draft_id): pass the details; returns missing fields or a summary to show the resident. After the resident types \"yes\", call again with only draft_id to fill the City's form in the visible browser up to its last step (documents). It never attaches files or submits. Returns a done-and-missing checklist.",
    input_schema: {
      type: "object",
      properties: {
        draft_id: { type: "string" },
        address: { type: "string" },
        project_description: {
          type: "string",
          description: "Scope of work in the City's style, e.g. 'Proposed new garden suite in rear yard of existing detached dwelling, using a City of Toronto certified (pre-approved) plan.'",
        },
        heritage_property: { type: "string", enum: ["Yes", "No", "Unknown"] },
        designer: {
          type: "string",
          enum: ["Home Owner/Qualified BCIN Designer", "Professional Engineer/Architect registered in Ontario", "Both"],
        },
        zap_certificate: { type: "string", enum: ["Yes", "No"] },
        full_name: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        corporation: { type: "string" },
        documents_have: {
          type: "array",
          items: { type: "string", enum: [...PERMIT_DOCUMENTS] },
          description: "Which of the City's mandatory documents the resident already has as PDFs.",
        },
      },
      additionalProperties: false,
    },
    // Not strict: strict tools allow only 16 optional fields in total. preparePermitApplication checks every value.
  },
  {
    name: "check_request_status",
    description:
      "Look up the current status of a 311 request on the City's tracking page, in the visible browser, by its reference number (about 8 digits, e.g. 10001234).",
    input_schema: {
      type: "object",
      properties: { tracking_number: { type: "string" } },
      required: ["tracking_number"],
      additionalProperties: false,
    },
    strict: true,
  },
];

// ---------- draft_service_request ----------

const TERMS_URL = "https://www.toronto.ca/home/311-toronto-at-your-service/311-terms-of-use/";

type DraftInput = {
  type: "pothole";
  location: string | null;
  exact_location: string | null;
  size_depth: string | null;
  major_road: "Yes" | "No" | null;
  shoebox_or_larger: "Yes" | "No" | null;
  additional_info: string | null;
  include_photo: boolean;
  contact_mode: "anonymous" | "contact" | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  email_updates: boolean | null;
};

export function draftServiceRequest(input: DraftInput, session: Session) {
  const clean = (s: string | null) => (s ?? "").trim();
  const missing: string[] = [];
  const tooLong: string[] = [];
  if (!clean(input.location)) missing.push("location (street address or intersection)");
  if (!clean(input.exact_location)) missing.push("exact spot on the road (side of road, distance from intersection)");
  if (!clean(input.size_depth)) missing.push("size and depth of the pothole");
  if (!input.major_road) missing.push("whether it's on a major road (Yes/No)");
  if (!input.shoebox_or_larger) missing.push("whether it's the size of a shoe box or larger (Yes/No)");
  if (!input.contact_mode) missing.push("file anonymously, or give name and email for updates");
  if (input.contact_mode === "contact") {
    if (!clean(input.first_name) || !clean(input.last_name)) missing.push("first and last name");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean(input.email))) missing.push("a valid email");
  }
  for (const [k, v] of [["exact_location", input.exact_location], ["size_depth", input.size_depth], ["additional_info", input.additional_info]] as const) {
    if (clean(v).length > 255) tooLong.push(`${k} (the City's form allows 255 characters)`);
  }
  if (input.include_photo && !session.photo) missing.push("the photo (none is attached in this chat)");

  // Any change voids an earlier "yes".
  session.confirmedDraftId = undefined;

  if (missing.length || tooLong.length) {
    session.draft = undefined;
    return { ready: false, missing, too_long: tooLong };
  }

  const draft: PotholeDraft = {
    id: `d${Date.now().toString(36)}`,
    type: "pothole",
    location: clean(input.location),
    exact_location: clean(input.exact_location),
    size_depth: clean(input.size_depth),
    major_road: input.major_road!,
    shoebox_or_larger: input.shoebox_or_larger!,
    additional_info: clean(input.additional_info) || undefined,
    photo_path: input.include_photo ? session.photo?.path : undefined,
    contact:
      input.contact_mode === "anonymous"
        ? { mode: "anonymous" }
        : {
            mode: "contact",
            first_name: clean(input.first_name),
            last_name: clean(input.last_name),
            email: clean(input.email),
            email_updates: !!input.email_updates,
          },
  };
  session.draft = draft;
  session.awaitingYes = draft.id;

  const lines = [
    "Pothole report for the City of Toronto (311)",
    `Location: ${draft.location}`,
    `Exact spot: ${draft.exact_location}`,
    `Size and depth: ${draft.size_depth}`,
    `On a major road: ${draft.major_road}`,
    `Shoe box size or larger: ${draft.shoebox_or_larger}`,
    draft.additional_info ? `Other details: ${draft.additional_info}` : null,
    `Photo: ${draft.photo_path ? session.photo?.name : "none"}`,
    draft.contact.mode === "anonymous"
      ? "Contact: anonymous (no status emails)"
      : `Contact: ${draft.contact.first_name} ${draft.contact.last_name}, ${draft.contact.email}${draft.contact.email_updates ? " (email updates on)" : ""}`,
    "",
    `Typing "yes" also means you agree to the City's 311 Terms of Use (${TERMS_URL}), which the City's form requires.`,
  ].filter((l) => l !== null);

  return {
    ready: true,
    draft_id: draft.id,
    summary: lines.join("\n"),
    instructions: 'Show this summary exactly, then ask the resident to type "yes" to file it with the City, or tell you what to change.',
    dry_run: DRY_RUN,
    hosted_demo: HOSTED,
  };
}

// ---------- submit_service_request ----------

export async function submitDraft(draftId: string, session: Session, status: Status) {
  const draft = session.draft;
  if (!draft || draft.id !== draftId) return { error: "No matching draft. Draft the request again." };
  if (draft.submitted) return { error: "This request was already filed. Do not file it again." };
  if (session.confirmedDraftId !== draftId) {
    return { error: 'Not confirmed. Show the summary and wait for the resident to type "yes".' };
  }
  // One "yes" buys one attempt.
  session.confirmedDraftId = undefined;
  if (HOSTED) return { hosted_demo: true, filed: false, message: HOSTED_FILING_OFF };
  const result = await submitServiceRequest(draft, status);
  if (result.ok && !result.dry_run) {
    draft.submitted = true;
    if (result.tracking_number) session.filed.push({ tracking_number: result.tracking_number, location: draft.location });
    await deletePhoto(session);
  }
  // The screenshot path is for the app, not the model.
  if (result.ok) {
    const { screenshot: _s, ...rest } = result;
    return rest;
  }
  return result;
}

// ---------- search_city_info ----------

export async function searchCityInfo(question: string, status: Status) {
  status("Searching toronto.ca…");
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    ...FALLBACK,
    output_config: { effort: "high" },
    system:
      "You research City of Toronto questions using only toronto.ca. Try a couple of different searches if the first one misses (the City often uses different words than residents, e.g. 'request', 'replacement', 'bin sizes'). Then answer in 2-4 plain sentences with the concrete steps, citing the page that says it. If toronto.ca does not clearly answer it, say so in one sentence and name the most relevant toronto.ca page.",
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5, allowed_domains: ["toronto.ca"] }],
    messages: [{ role: "user", content: question }],
  });

  if (response.stop_reason === "refusal") return { answer: "Could not answer this one.", sources: [] };

  let answer = "";
  const sources = new Map<string, string>();
  for (const block of response.content) {
    if (block.type !== "text") continue;
    answer += block.text;
    for (const c of block.citations ?? []) {
      if (c.type === "web_search_result_location" && c.url.includes("toronto.ca")) sources.set(c.url, c.title ?? c.url);
    }
  }
  return {
    answer: answer.trim(),
    sources: [...sources].map(([url, title]) => ({ url, title })),
    note: sources.size === 0 ? "No toronto.ca page was cited. Tell the resident you're not sure." : undefined,
  };
}

// ---------- lookup_address_service ----------


export async function lookupAddressService(address: string, service: string, status: Status) {
  if (service !== "garbage_schedule") return { error: `Service '${service}' is not supported yet.` };

  // The hosted demo has no browser: read the City's published collection calendar instead.
  if (HOSTED) {
    status("Checking the City's collection calendar…");
    return garbageScheduleFromData(address);
  }

  status("Opening the City's collection schedule…");
  return withPage(async (page) => {
    await page.goto(SCHEDULE_URL, { waitUntil: "domcontentloaded" });
    await page.locator("#address").waitFor({ timeout: 15_000 });
    await waitIfCaptcha(page, "Collection schedule: page load", status);

    status(`Looking up ${address}…`);
    const { picked, suggestions } = await pickAddress(page, "#address", address);
    if (!picked) {
      await logFriction({
        url: SCHEDULE_URL,
        step: "Collection schedule: address lookup",
        problem: suggestions.length ? "Typed address not among the City's suggestions" : "City's address search returned no suggestions",
      });
      return {
        error: "That address was not found exactly.",
        city_suggestions: suggestions,
        source_url: SCHEDULE_URL,
      };
    }

    await waitIfCaptcha(page, "Collection schedule: after address", status);
    const result = page.locator("text=/Collection Calendar for|No collection available/").first();
    await result.waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1000);
    const text = await page.evaluate(() => document.body.innerText);
    const section = text.split("Find Location")[1]?.split("In This Section")[0] ?? "";
    const trimmed = section
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !/Illustration|Leaflet|Powered by|^today$/.test(l))
      .slice(0, 40)
      .join("\n");

    if (/No collection available/.test(trimmed)) {
      await logFriction({ url: SCHEDULE_URL, step: "Collection schedule: result", problem: "No collection available for a looked-up address" });
    }
    return { matched_address: picked, schedule_text: trimmed, source_url: SCHEDULE_URL };
  });
}

// ---------- check_request_status ----------

const TRACK_URL = "https://www.toronto.ca/home/311-toronto-at-your-service/track-a-service-request/";

export async function checkRequestStatus(trackingNumber: string, status: Status) {
  const number = trackingNumber.replace(/\D/g, "");
  if (number.length < 7 || number.length > 10) {
    return { error: "City reference numbers are about 8 digits, like 10001234. Ask the resident to check it." };
  }

  // The City's tracker only answers browsers that pass its invisible CAPTCHA, and
  // hard rule 3 says we don't get around that. Open311 read access would fix this.
  if (HOSTED) {
    return {
      hosted_demo: true,
      found: null,
      message: "The hosted demo can't look up live status: the City's tracker only works in a real browser. Check it on the City's tracking page. On Mike's laptop, 1City looks it up there for you.",
      source_url: TRACK_URL,
    };
  }

  status("Opening the City's request tracker…");
  return withPage(async (page) => {
    await page.goto(TRACK_URL, { waitUntil: "domcontentloaded" });
    const input = page.locator("#js_input__lookup--lookup");
    await input.waitFor({ timeout: 15_000 });
    await waitIfCaptcha(page, "Track a request: page load", status);

    status(`Looking up request #${number}…`);
    // The page asks the City's 311 system for the record; keep its raw answer too.
    const apiAnswer = page
      .waitForResponse((r) => r.url().includes("/api/RequestSummaryItems/"), { timeout: 20_000 })
      .then(async (r) => ({ status: r.status(), body: (await r.text()).slice(0, 4000) }))
      .catch(() => null);
    await input.fill(number);
    await page.locator("#js_button__address--lookup").click();
    const api = await apiAnswer;
    await page.waitForTimeout(1500);
    await waitIfCaptcha(page, "Track a request: after search", status);

    const text = await page.evaluate(() => document.body.innerText);
    const result = (text.split("Enter a request reference number")[1] ?? "")
      .split("In This Section")[0]
      .replace(/Request # e\. g\. 10001234|\bX\b|Search/g, "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 40)
      .join("\n");

    if (/No results found/i.test(result)) {
      await logFriction({ url: TRACK_URL, step: "Track a request", problem: "Reference number not found (may take time to appear after filing)" });
      return { found: false, page_text: result, source_url: TRACK_URL };
    }
    if (!api || api.status >= 400) {
      await logFriction({ url: TRACK_URL, step: "Track a request", problem: `City's tracker answered with an error (${api?.status ?? "no response"})` });
    }
    return { found: true, page_text: result, city_record: api?.body, source_url: TRACK_URL };
  });
}

// ---------- dispatcher ----------

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  session: Session,
  status: Status,
): Promise<unknown> {
  switch (name) {
    case "search_city_info":
      return searchCityInfo(String(input.question), status);
    case "lookup_address_service":
      return lookupAddressService(String(input.address), String(input.service), status);
    case "draft_service_request":
      return draftServiceRequest(input as unknown as DraftInput, session);
    case "submit_service_request":
      return submitDraft(String(input.draft_id), session, status);
    case "check_permit_requirements":
      return checkPermitRequirements(String(input.project), String(input.address), status);
    case "lookup_zoning":
      return lookupZoning(String(input.address), status);
    case "prepare_permit_application":
      return preparePermitApplication(input as unknown as PermitInput, session, status);
    case "check_request_status":
      return checkRequestStatus(String(input.tracking_number), status);
    default:
      return { error: `Unknown tool ${name}` };
  }
}
