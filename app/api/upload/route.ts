import os from "os";
import path from "path";
import { promises as fs } from "fs";
import { getSession, deletePhoto } from "@/lib/session";
import { HOSTED } from "@/lib/mode";

export const runtime = "nodejs";

// The City's form takes jpeg, png or gif up to 10 MB.
const TYPES: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif" };
const MAX_BYTES = 10 * 1024 * 1024;

// Photos go to the system temp folder, are used for one request, then deleted.
export async function POST(req: Request) {
  if (HOSTED) return Response.json({ error: "Photos are turned off in the hosted demo." }, { status: 403 });
  const form = await req.formData();
  const sessionId = String(form.get("sessionId") ?? "");
  const file = form.get("photo");
  if (!sessionId || !(file instanceof File)) return Response.json({ error: "No photo" }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return Response.json({ error: "Please use a JPG, PNG or GIF photo." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Photo is over 10 MB." }, { status: 400 });

  const session = getSession(sessionId);
  await deletePhoto(session);
  const dest = path.join(os.tmpdir(), `1city-photo-${crypto.randomUUID()}${ext}`);
  await fs.writeFile(dest, Buffer.from(await file.arrayBuffer()));
  session.photo = { path: dest, name: file.name };
  return Response.json({ ok: true, name: file.name });
}
