"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "bot"; text: string; error?: boolean; photoUrl?: string };

// Turn bare URLs into clickable links.
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A photo that's been uploaded but not yet mentioned in a sent message.
  const [photo, setPhoto] = useState<{ name: string; url: string } | null>(null);
  const sessionId = useRef<string>("");
  // Hosted demo only: the signed conversation the server hands back after each reply.
  const sealedState = useRef<string | undefined>(undefined);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function attach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const form = new FormData();
    form.append("sessionId", sessionId.current);
    form.append("photo", file);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!data.ok) {
      setMessages((m) => [...m, { role: "bot", text: data.error ?? "Couldn't attach that photo.", error: true }]);
      return;
    }
    setPhoto({ name: file.name, url: URL.createObjectURL(file) });
  }

  useEffect(() => {
    sessionId.current = crypto.randomUUID();
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setStatus("Thinking…");
    const sentPhoto = photo;
    setPhoto(null);
    setMessages((m) => [...m, { role: "user", text, photoUrl: sentPhoto?.url }]);
    const message = sentPhoto ? `${text}\n[Resident attached a photo: ${sentPhoto.name}]` : text;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId.current, message, state: sealedState.current }),
      });
      if (!res.body) throw new Error("No response");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line) as { type: string; text: string };
          if (evt.type === "status") setStatus(evt.text);
          if (evt.type === "reply") setMessages((m) => [...m, { role: "bot", text: evt.text }]);
          if (evt.type === "error") setMessages((m) => [...m, { role: "bot", text: `Error: ${evt.text}`, error: true }]);
          if (evt.type === "state") sealedState.current = evt.text;
        }
      }
    } catch (err) {
      setMessages((m) => [...m, { role: "bot", text: `Error: ${String(err)}`, error: true }]);
    } finally {
      setStatus(null);
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="top">
        <div>
          <div className="brand">
            1<span>City</span>
          </div>
          <div className="tag">One chat for every City Hall service · Toronto</div>
        </div>
        <a href="/log">Friction log</a>
      </header>
      {process.env.NEXT_PUBLIC_HOSTED === "true" && (
        <div className="hosted-banner">
          Hosted demo: ask anything and try a pothole report or a garden suite permit. Filing with the City is turned off here; the
          video shows the real filing.
        </div>
      )}

      <section className="chat">
        {messages.length === 0 && (
          <div className="empty">
            <p>Ask anything about City of Toronto services.</p>
            <p>Try: &ldquo;When is garbage day at 272 Roncesvalles Ave?&rdquo;</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}${m.error ? " error" : ""}`}>
            {m.photoUrl && <img className="thumb" src={m.photoUrl} alt="Attached photo" />}
            {m.role === "bot" ? <Linkified text={m.text} /> : m.text}
          </div>
        ))}
        {status && <div className="status">{status}</div>}
        <div ref={bottom} />
      </section>

      {photo && (
        <div className="pending-photo">
          <img src={photo.url} alt="" /> {photo.name} attached
        </div>
      )}
      <form className="composer" onSubmit={send}>
        {/* No photo uploads on the hosted demo: there's nowhere to keep them and nothing gets filed. */}
        {process.env.NEXT_PUBLIC_HOSTED !== "true" && (
          <>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/gif" hidden onChange={attach} />
            <button type="button" className="attach" onClick={() => fileInput.current?.click()} disabled={busy} aria-label="Attach a photo">
              📎
            </button>
          </>
        )}
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your question…"
          aria-label="Message"
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </main>
  );
}
