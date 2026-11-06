# 1City prototype

## What this is
1City is one chat for every City Hall service. This repo is a **local prototype for a 2 to 3 minute demo video** that goes to Y Combinator as an application update. The full version runs on Mike's laptop only. A password-protected hosted demo with filing switched off is linked from the YC update (hard rule 7). It is not production software.

Mike is not a programmer. Explain what you are doing in plain language, keep the setup simple, and tell him exactly what to click or type when he has to do something himself.

## The demo (build exactly this, nothing more)
A Toronto resident uses one chat window to do four real things:

1. **Ask a 311 question and get a sourced answer.** Example: "When is garbage day at [address]?" or "How do I get a new green bin?" The answer must include the toronto.ca link it came from. If the agent is not sure, it says so and gives the link instead of guessing.
2. **File a real service request.** Example: "There's a pothole outside [address]." The agent asks for anything missing (exact location, description, photo if the form takes one), shows a plain summary, and waits for the resident to type "yes". Only then does it open the City's 311 web form in a **visible browser**, fill it in, submit it, and return the tracking number in the chat.
3. **Check status.** "What's happening with my pothole report?" The agent looks up the request by tracking number on the City's site and reports the status.
4. **Start a building permit application for a garden suite (a backyard home) using one of the City's pre-approved garden suite plans.** "I want to build a garden suite in my backyard at [address] using one of the City's pre-approved plans. What do I need, and can you start the permit application?" The agent:
   - notes that a pre-approved plan still needs a building permit and a site-specific review, citing the toronto.ca page it used.
   - looks up the property's zoning, checks whether garden suites are allowed on the lot, and notes anything else that affects the project, with the source.
   - flags the tree declaration form, with the source.
   - lists what the application needs (drawings, site plan, forms, fees) and marks what the resident has and what is missing.
   - fills in the City's online building permit application in the **visible browser** up to the documents step, the last step before Submit, and stops there. It attaches nothing and submits nothing.
   - ends with a plain checklist: what's done, what's still missing, and who at the City reviews it.
   - links each source it used.

   It never says a project "will be approved" or "complies." City staff decide.

Plus a **friction log**: every time the agent hits an extra step, a confusing field, an error, a login wall or a CAPTCHA on the City's site, write one line to `logs/friction.jsonl` (time, page URL, step, what went wrong). A simple `/log` page lists them. This shows where City services break, which is what 1City will sell to cities.

## Stack
- Next.js (App Router, TypeScript), one page with a chat UI. Plain and readable on a screen recording: large text, clean layout.
- Anthropic TypeScript SDK. Model: `claude-sonnet-5-5`. Use tool use for the actions below.
- For looking things up, use Anthropic's server-side web search tool restricted to `toronto.ca` (check the current Anthropic docs for the exact tool name and version). Fall back to Playwright page reads when the answer sits behind an address lookup.
- Playwright with Chromium in **headed** mode (`headless: false`, `slowMo` around 300 ms) so the form filling is visible on video.
- No database. Keep state in memory, logs in `logs/`.
- API key in `.env.local` as `ANTHROPIC_API_KEY`. Never commit it. Add `.env.local` and `logs/` to `.gitignore`.

## Tools the agent gets
| Tool | What it does |
| --- | --- |
| `search_city_info(question)` | Finds the answer on toronto.ca and returns the answer text plus the source URL |
| `lookup_address_service(address, service)` | Uses Playwright for address-based lookups such as the garbage collection schedule |
| `draft_service_request(type, details)` | Collects the fields the request type needs and returns a summary for the resident to confirm |
| `submit_service_request(draft)` | Only callable after the resident confirms. Drives the City's 311 web form in the visible browser, submits it, and returns the tracking number |
| `check_request_status(tracking_number)` | Looks up the request status on the City's site |
| `check_permit_requirements(project, address)` | Finds whether the project needs a permit and what the application requires, with source links |
| `lookup_zoning(address)` | Finds the property's zoning from the City's zoning map or by-law pages, with the source |
| `prepare_permit_application(project, address, details)` | Fills in the application up to the documents step. It has no attach or submit step at all. Returns a checklist of done and missing items |

## Hard rules
1. **Never submit anything without the resident typing "yes" to the summary.** Enforce this in code, not just in the prompt.
2. **Real requests only.** This prototype files real 311 requests that City staff act on. No test or fake submissions to the live site. During development, run the form flow with submission switched off (`DRY_RUN=true`, the default) and stop at the final review screen. Mike switches `DRY_RUN=false` only for the one real request on camera.
3. **Do not get around CAPTCHAs, rate limits or login walls.** If one appears, pause, log it in the friction log, and hand control to Mike in the visible browser. Resume after he finishes.
4. Keep traffic to the City's site low: no loops, no parallel sessions, no scraping beyond what a single resident would do.
5. Do not store anyone's personal information beyond the current session, except in the friction log, and keep personal details out of that.
6. Never submit a building permit application, upload documents or pay fees. The permit flow stops at the documents step every time, with or without DRY_RUN. If the City's site requires an account login to start an application, pause and hand control to Mike.
7. **The hosted demo never files anything and never opens a browser.** A copy runs on Vercel for invited reviewers (YC partners), behind a username and password, with `HOSTED=true`. In that mode, questions, zoning, summaries and checklists work; submitting a 311 request and filling the permit form are switched off in code and the chat says so. Only Mike's laptop, with `HOSTED` unset, drives the City's site.

## Build order
1. **First, map the real flow.** Before writing form automation, Mike files nothing but walks through the City's online pothole request once by hand, up to the final review screen, while you watch with Playwright's codegen or he describes each screen. Record every step and field in `docs/pothole-flow.md`. Each annoying step goes in the friction log too.
2. **Day 1:** project setup, chat UI, Claude tool loop, `search_city_info` working with source links. Done when a garbage-day or green-bin question gets a correct, linked answer.
3. **Day 2:** `draft_service_request` and `submit_service_request` for the pothole type, with `DRY_RUN=true`. Done when the browser fills every field and stops at the review screen.
4. **Day 3:** `check_request_status`, error handling, the friction log page. Done when all three scenes run start to finish without restarting the app.
5. **Day 4:** buffer to fix anything from days 1 to 3, then run all three 311 scenes end to end twice.
6. **Day 5:** building permit application. First, Mike walks the City's online building permit application by hand up to the documents step for one project (a garden suite using a pre-approved plan), and you record every step and field in `docs/permit-flow.md`, with each friction point in the friction log. Then build the three permit tools. Done when the agent answers "do I need a permit," shows the zoning with a source, fills the application to the documents step, and returns a clear done-and-missing checklist.
7. **Day 6:** recording. Mike files his one real 311 request with `DRY_RUN=false`. The permit scene stops at the documents step as always.

## Later (not now)
Toronto's Open311 API lets approved apps post service requests directly with an API key. Mike will ask the City for access (open311@toronto.ca). When that arrives, swap the browser-based submit for the API. Keep the submit code behind one function so the swap is easy.

## How to work with Mike
- Do one build step at a time. At the end of each, tell him in two or three plain sentences what works now and what he should try.
- Before installing anything beyond Node packages, ask first.
- When he needs to do something himself (create the API key, walk the form by hand, switch DRY_RUN off), give numbered steps.
