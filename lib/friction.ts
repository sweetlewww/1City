import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { HOSTED } from "./mode";

// One line per problem the agent hits on the City's site.
// Keep personal details (names, phone numbers, emails, home addresses) out of it.
//
// On the laptop: logs/friction.jsonl (never uploaded).
// On the hosted demo the app can't write there, so new lines go to a temp
// file, and the log page also shows data/friction-snapshot.jsonl: the real
// City findings from the laptop, copied in before deploying.

const LOG_FILE = HOSTED ? path.join(os.tmpdir(), "1city-friction.jsonl") : path.join(process.cwd(), "logs", "friction.jsonl");
const SNAPSHOT = path.join(process.cwd(), "data", "friction-snapshot.jsonl");

export type FrictionEntry = {
  time: string;
  url: string;
  step: string;
  problem: string;
};

export async function logFriction(entry: Omit<FrictionEntry, "time">) {
  const line: FrictionEntry = { time: new Date().toISOString(), ...entry };
  try {
    await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });
    await fs.appendFile(LOG_FILE, JSON.stringify(line) + "\n");
  } catch (err) {
    // A log line must never break the resident's request.
    console.error("Could not write friction log", err);
  }
}

async function readLines(file: string): Promise<FrictionEntry[]> {
  try {
    const text = await fs.readFile(file, "utf8");
    return text
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as FrictionEntry);
  } catch {
    return [];
  }
}

export async function readFriction(): Promise<FrictionEntry[]> {
  const lines = HOSTED ? [...(await readLines(SNAPSHOT)), ...(await readLines(LOG_FILE))] : await readLines(LOG_FILE);
  return lines.reverse();
}
