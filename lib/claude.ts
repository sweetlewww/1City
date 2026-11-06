import Anthropic from "@anthropic-ai/sdk";

// Reads ANTHROPIC_API_KEY from .env.local. Keys that aren't tied to a
// workspace also need ANTHROPIC_WORKSPACE_ID.
const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
export const client = new Anthropic({
  defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
});

export const MODEL = "claude-sonnet-5-5";

// If a safety check declines a request, the API retries it on a recommended
// fallback model instead of returning a refusal.
export const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};
