"use client";

import { useState } from "react";

export default function Waitlist() {
  const [email, setEmail] = useState("");
  const [neighbourhood, setNeighbourhood] = useState("");
  const [website, setWebsite] = useState(""); // hidden field; only bots fill it in
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, neighbourhood, website }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Something went wrong.");
      setState("done");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (state === "done") {
    return <p className="waitlist-done">Thanks. You&apos;re on the list, and we&apos;ll email you an invite.</p>;
  }

  return (
    <form className="waitlist" onSubmit={submit}>
      <label>
        Email
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </label>
      <label>
        Neighbourhood <span className="optional">(optional)</span>
        <input value={neighbourhood} onChange={(e) => setNeighbourhood(e.target.value)} placeholder="e.g. Roncesvalles" maxLength={80} />
      </label>
      <input className="hp" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} aria-hidden="true" />
      <button className="btn primary" type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Get early access"}
      </button>
      {state === "error" && <p className="waitlist-error">{message}</p>}
      <p className="fine-print">We&apos;ll only use your email to invite you to 1City. No spam, and you can ask us to delete it any time.</p>
    </form>
  );
}
