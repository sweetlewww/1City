import { createHash, createHmac, timingSafeEqual } from "crypto";
import type { Session } from "./session";

// Hosted demo only. Vercel may answer each message on a different machine, so
// in-memory chats would be forgotten between messages. Instead, after each
// reply the conversation goes back to the visitor's browser, signed so it
// can't be edited (that keeps the "yes" check meaningful), and comes back
// with the next message. Nothing is stored on the server.

const MAX_AGE_MS = 6 * 3600_000;

type Sealed = Pick<Session, "history" | "draft" | "permitDraft" | "awaitingYes" | "filed" | "messageCount"> & { at: number };

function key() {
  // Derived from two server-only secrets, so no extra setting is needed.
  const parts = [process.env.ANTHROPIC_API_KEY, process.env.DEMO_PASSWORD];
  if (parts.some((p) => !p)) throw new Error("Hosted demo is missing ANTHROPIC_API_KEY or DEMO_PASSWORD.");
  return createHash("sha256").update(`1city-session|${parts.join("|")}`).digest();
}

function sign(body: string) {
  return createHmac("sha256", key()).update(body).digest("base64url");
}

export function seal(s: Session): string {
  const data: Sealed = {
    history: s.history,
    draft: s.draft,
    permitDraft: s.permitDraft,
    awaitingYes: s.awaitingYes,
    filed: s.filed,
    messageCount: s.messageCount,
    at: Date.now(),
  };
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Returns the conversation, or a fresh one if the token is missing, edited or too old. */
export function unseal(token: unknown): Session {
  const fresh: Session = { history: [], filed: [] };
  if (typeof token !== "string" || !token.includes(".")) return fresh;
  const [body, mac] = token.split(".");
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac ?? "");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return fresh;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as Sealed;
    if (Date.now() - data.at > MAX_AGE_MS) return fresh;
    return { history: data.history ?? [], draft: data.draft, permitDraft: data.permitDraft, awaitingYes: data.awaitingYes, filed: data.filed ?? [], messageCount: data.messageCount };
  } catch {
    return fresh;
  }
}
