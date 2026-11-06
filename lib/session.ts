import type Anthropic from "@anthropic-ai/sdk";
import { promises as fs } from "fs";

// Everything about one chat lives here, in memory only. It disappears when
// the app restarts (hard rule 5: no personal info kept beyond the session).

export type PotholeDraft = {
  id: string;
  type: "pothole";
  location: string; // address or intersection, as the City's search would know it
  exact_location: string; // side of road, distance from intersection, landmarks
  size_depth: string;
  major_road: "Yes" | "No";
  shoebox_or_larger: "Yes" | "No"; // City asks "Is the road damage the size of a shoe box or larger?"
  additional_info?: string;
  photo_path?: string;
  contact:
    | { mode: "anonymous" }
    | { mode: "contact"; first_name: string; last_name: string; email: string; email_updates: boolean };
  submitted?: boolean;
};

export const PERMIT_DOCUMENTS = [
  "Application Drawings",
  "Building Permit Application",
  "Energy Efficiency Design Summary",
  "Schedule 1: Designer's Information",
  "Tree Declaration Form (Urban Forestry)",
] as const;

export type PermitDraft = {
  id: string;
  address: string;
  project_description: string;
  heritage: "No";
  committee_of_adjustment_notice: "No";
  designer: "Home Owner/Qualified BCIN Designer" | "Professional Engineer/Architect registered in Ontario" | "Both";
  zap_certificate: "Yes" | "No";
  applicant: { full_name: string; phone: string; email: string; corporation?: string };
  documents_have: string[];
  prepared?: boolean;
};

export type Session = {
  history: Anthropic.Beta.BetaMessageParam[];
  draft?: PotholeDraft;
  // Set only when the resident's latest message was "yes" right after seeing
  // the summary of this exact draft. Cleared on any other message.
  confirmedDraftId?: string;
  // The draft whose summary the resident was last asked to say "yes" to.
  awaitingYes?: string;
  permitDraft?: PermitDraft;
  photo?: { path: string; name: string };
  // Requests filed in this chat, so "what's happening with my report?" needs no number.
  filed: { tracking_number: string; location: string }[];
  busy?: boolean;
  messageCount?: number;
};

const g = globalThis as unknown as { __sessions?: Map<string, Session> };
const sessions = (g.__sessions ??= new Map());

export function getSession(id: string): Session {
  let s = sessions.get(id);
  if (!s) {
    s = { history: [], filed: [] };
    sessions.set(id, s);
  }
  return s;
}

/** A plain "yes" (optionally "yes, submit it", "yes please") counts. Nothing else does. */
export function isYes(message: string) {
  return /^\s*(yes|yes please|yes,? (please )?(submit|file|send)( it)?)\s*[.!]*\s*$/i.test(message);
}

export async function deletePhoto(s: Session) {
  if (s.photo) await fs.unlink(s.photo.path).catch(() => {});
  s.photo = undefined;
}
