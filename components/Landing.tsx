import Waitlist from "./Waitlist";

// Public landing page for 1city.io (hosted mode only; on Mike's laptop the
// home page is the chat). Set NEXT_PUBLIC_DEMO_VIDEO_URL on Vercel once the
// video is uploaded: a YouTube, Vimeo or Loom link, or a direct .mp4 link.

const FEATURES = [
  {
    title: "Ask anything",
    body: "Garbage day, bins, permits, bylaws. Every answer links the toronto.ca page it came from, and it says so when it isn't sure.",
  },
  {
    title: "Report a problem",
    body: "Tell it about a pothole. It asks what the City needs, shows you a summary, and only files it with 311 after you type yes.",
  },
  {
    title: "Track it",
    body: "Ask what's happening with your report and get the status from the City in plain words.",
  },
  {
    title: "Get a permit ready",
    body: "Building a garden suite? It checks the rules and your lot's zoning, lists what's missing, and fills in the application for City staff to review.",
  },
];

function videoEmbed(url: string) {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/);
  if (yt) return { kind: "iframe" as const, src: `https://www.youtube-nocookie.com/embed/${yt[1]}` };
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return { kind: "iframe" as const, src: `https://player.vimeo.com/video/${vimeo[1]}` };
  const loom = url.match(/loom\.com\/share\/([\w]+)/);
  if (loom) return { kind: "iframe" as const, src: `https://www.loom.com/embed/${loom[1]}` };
  return { kind: "video" as const, src: url };
}

export default function Landing() {
  const videoUrl = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL;
  const video = videoUrl ? videoEmbed(videoUrl) : null;

  return (
    <main className="landing">
      <nav className="landing-nav">
        <div className="brand">
          1<span>City</span>
        </div>
        <a className="nav-link" href="/demo">
          Partner demo
        </a>
      </nav>

      <section className="hero">
        <p className="eyebrow">Toronto · Prototype</p>
        <h1>One chat for every City Hall service.</h1>
        <p className="lede">
          Toronto residents deal with dozens of City websites and forms. 1City answers your questions with sources, files your 311
          requests, tracks them, and gets permit applications ready. City staff still make every decision.
        </p>
        <div className="cta-row">
          <a className="btn primary" href="#early-access">
            Get early access
          </a>
          <a className="btn" href="/demo">
            Partner demo (sign in)
          </a>
        </div>
      </section>

      <section className="video-wrap" aria-label="Demo video">
        {video?.kind === "iframe" && (
          <iframe src={video.src} title="1City demo" allow="fullscreen; picture-in-picture" allowFullScreen loading="lazy" />
        )}
        {video?.kind === "video" && <video src={video.src} controls preload="metadata" />}
        {!video && (
          <div className="video-placeholder">
            <strong>Demo video coming soon</strong>
            <span>About 3 minutes: a Toronto resident gets real City Hall work done in one chat.</span>
          </div>
        )}
      </section>

      <section className="features">
        {FEATURES.map((f) => (
          <div className="feature" key={f.title}>
            <h2>{f.title}</h2>
            <p>{f.body}</p>
          </div>
        ))}
      </section>

      <section className="for-cities">
        <h2>For cities</h2>
        <p>
          Every time 1City hits an extra step, a confusing field, an error or a login wall on a City website, it logs it. That log
          shows exactly where City services break for residents, and what to fix first.
        </p>
      </section>

      <section className="early-access" id="early-access">
        <h2>Live in Toronto? Try 1City early.</h2>
        <p>We&apos;re inviting the first 100 Toronto residents. Leave your email and we&apos;ll send you an invite.</p>
        <Waitlist />
      </section>

      <footer className="landing-footer">
        <p>
          1City is an independent prototype. It is not affiliated with or endorsed by the City of Toronto. For emergencies call 911;
          for City services you can always call 311.
        </p>
        <p>© 2026 1City</p>
      </footer>
    </main>
  );
}
