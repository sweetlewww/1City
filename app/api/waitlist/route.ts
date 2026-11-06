// Early-access sign-ups from the landing page. There's no database in this
// project, so each sign-up is forwarded to a form service (e.g. a Formspree
// form endpoint) set in WAITLIST_FORM_URL. Nothing is stored here.

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { email, neighbourhood, website } = (await req.json().catch(() => ({}))) as {
    email?: string;
    neighbourhood?: string;
    website?: string;
  };

  // Hidden field: people never see it, bots fill it in. Pretend it worked.
  if (website) return Response.json({ ok: true });

  const cleanEmail = String(email ?? "").trim().slice(0, 200);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
    return Response.json({ ok: false, error: "Please enter a valid email." }, { status: 400 });
  }

  const target = process.env.WAITLIST_FORM_URL;
  if (!target) return Response.json({ ok: false, error: "Sign-ups open soon. Please check back in a few days." }, { status: 503 });

  const res = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      email: cleanEmail,
      neighbourhood: String(neighbourhood ?? "").trim().slice(0, 80),
      source: "1city.io landing page",
    }),
  }).catch(() => null);

  if (!res?.ok) return Response.json({ ok: false, error: "Couldn't save that right now. Please try again in a minute." }, { status: 502 });
  return Response.json({ ok: true });
}
