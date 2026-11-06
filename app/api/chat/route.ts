import { runTurn } from "@/lib/agent";
import Anthropic from "@anthropic-ai/sdk";
import { getSession, isYes } from "@/lib/session";
import { HOSTED } from "@/lib/mode";
import { seal, unseal } from "@/lib/sealedSession";

// Hosted demo only: a cap per chat, as a second guard on the API bill
// (the first is the monthly spend limit on the Anthropic workspace).
const HOSTED_MAX_MESSAGES = 40;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Permit research can take a minute or two; give hosted requests room.
export const maxDuration = 300;

export async function POST(req: Request) {
  const { sessionId, message, state } = (await req.json()) as { sessionId: string; message: string; state?: string };
  if (!sessionId || !message?.trim()) return new Response("Missing message", { status: 400 });

  // On the laptop, chats live in memory. On Vercel they travel with the browser (see lib/sealedSession.ts).
  const session = HOSTED ? unseal(state) : getSession(sessionId);
  if (HOSTED && (session.messageCount = (session.messageCount ?? 0) + 1) > HOSTED_MAX_MESSAGES) {
    const text = "This demo chat has reached its message limit. Refresh the page to start a new chat.";
    return new Response(JSON.stringify({ type: "reply", text }) + "\n", { headers: { "Content-Type": "application/x-ndjson" } });
  }
  if (session.busy) return new Response("Still working on the last message", { status: 409 });
  session.busy = true;

  // Hard rule 1, enforced here and not by the model: a request can only be
  // filed if this exact message is "yes" and a draft summary is waiting.
  const text = message.trim();
  session.confirmedDraftId = isYes(text) ? session.awaitingYes : undefined;
  session.awaitingYes = undefined;
  session.history.push({ role: "user", content: text });

  // Stream newline-separated JSON: status updates while tools run, then the reply.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const reply = await runTurn(session, (status) => send({ type: "status", text: status }));
        send({ type: "reply", text: reply });
      } catch (err) {
        console.error(err);
        send({ type: "error", text: friendlyError(err) });
      } finally {
        session.confirmedDraftId = undefined;
        session.busy = false;
        if (HOSTED) send({ type: "state", text: seal(session) });
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}

function friendlyError(err: unknown): string {
  if (err instanceof Anthropic.RateLimitError) return "I'm getting too many requests right now. Please wait a minute and try again.";
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key isn't working.";
  if (err instanceof Anthropic.InternalServerError) return "The AI service is busy right now. Please try again in a moment.";
  if (err instanceof Anthropic.APIConnectionError) return "I can't reach the internet right now. Check the Wi-Fi and try again.";
  if (err instanceof Anthropic.APIError) return `The AI service returned an error (${err.status}). Please try again.`;
  return "Something went wrong on my side. Please try again.";
}
