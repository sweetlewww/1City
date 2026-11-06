# 1City

**One chat for every City Hall service.** A working prototype for Toronto.

A resident types what they need in plain language, and 1City does the City Hall work:

1. **Answers 311 questions with a source.** "When is garbage day at my address?" gets the answer from the City's own data, with the toronto.ca link it came from. If it isn't sure, it says so and gives the link.
2. **Files a real 311 service request.** "There's a pothole outside…" makes it ask for anything missing and show a plain summary. Only after the resident types **yes** does it fill in the City's 311 web form in a visible browser and return the tracking number.
3. **Checks request status** by tracking number.
4. **Starts a building permit application** for a garden suite using one of the City's pre-approved plans. It looks up the lot's zoning on the City's map, flags the tree declaration form, lists what the application needs, and fills in the City's online application **up to the documents step**. It never attaches files, submits or pays, and it never says a project "will be approved". City staff decide.

It also keeps a **friction log**: every confusing field, error, hung page, login wall or CAPTCHA on the City's sites becomes one line in `logs/friction.jsonl`, listed at `/log`. That's the map of where City services break.

> 1City is an independent project. It is not affiliated with or endorsed by the City of Toronto.

## Safety rules (enforced in code)

- **Nothing is filed without the resident typing "yes"** to the summary. The submit tool refuses otherwise.
- **Practice mode is the default.** With `DRY_RUN=true`, the 311 form is filled up to the City's review screen and nothing is submitted. Only set `DRY_RUN=false` for a real request you actually mean to file, because City staff act on it.
- **No getting around CAPTCHAs, rate limits or login walls.** If one appears, 1City logs it and hands control to the person at the keyboard.
- **The permit flow always stops at the documents step**, with or without `DRY_RUN`.
- **Low traffic:** one browser, one request at a time, no scraping.
- **Hosted mode (`HOSTED=true`) never files anything and never opens a browser.** Questions, zoning, summaries and checklists work. Filing and form-filling are switched off.

## Run it locally

You need Node.js 20+ and Google Chrome.

```bash
npm install
cp .env.local.example .env.local   # then paste your Anthropic API key into .env.local
npm run dev
```

Open http://localhost:3000.

| Setting | What it does |
| --- | --- |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (never commit it) |
| `DRY_RUN` | `true` (default) stops at the City's review screen; `false` really files |
| `ANTHROPIC_WORKSPACE_ID` | Only needed if your key isn't tied to a workspace |
| `HOSTED`, `NEXT_PUBLIC_HOSTED` | `true` for a public deployment: no filing, no browser |
| `DEMO_USER`, `DEMO_PASSWORD` | Basic Auth for `/demo` when hosted (fails closed if unset) |
| `WAITLIST_FORM_URL` | Optional form endpoint for the landing page waitlist |

## How it works

- **Next.js** (App Router, TypeScript): one chat page that streams replies.
- **Claude** (`claude-sonnet-5-5`) with tool use. Web search and fetch are limited to `toronto.ca`.
- **Playwright** drives installed Chrome in headed mode with `slowMo`, so you can watch every field being filled.
- **City data:** the City's geocoder, the solid waste collection calendar, and the zoning by-law map layers.
- No database. Session state lives in memory, or in a signed token in hosted mode.

| Path | What's there |
| --- | --- |
| `lib/agent.ts` | System prompt and the Claude tool loop |
| `lib/tools.ts` | Tool definitions and the "yes" gate |
| `lib/submit.ts` | 311 pothole form automation, behind one function so it can be swapped for Toronto's Open311 API |
| `lib/permit.ts` | Permit requirements, zoning lookup and the application filler |
| `lib/friction.ts` | Friction log |
| `docs/pothole-flow.md`, `docs/permit-flow.md` | Step-by-step maps of the City's real forms |

## License

MIT. See [LICENSE](LICENSE).
