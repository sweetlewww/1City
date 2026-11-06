import { readFriction } from "@/lib/friction";

export const dynamic = "force-dynamic";

export default async function LogPage() {
  const entries = await readFriction();
  return (
    <main className="shell">
      <header className="top">
        <div>
          <div className="brand">
            1<span>City</span> friction log
          </div>
          <div className="tag">Every extra step, confusing field, error or wall the agent hit on the City&apos;s site</div>
        </div>
        <a href="/">Back to chat</a>
      </header>
      {entries.length === 0 ? (
        <p className="empty">Nothing logged yet.</p>
      ) : (
        <table className="log">
          <thead>
            <tr>
              <th>When</th>
              <th>Step</th>
              <th>What went wrong</th>
              <th>Page</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i}>
                <td>{new Date(e.time).toLocaleString("en-CA", { timeZone: "America/Toronto" })}</td>
                <td>{e.step}</td>
                <td>{e.problem}</td>
                <td className="url">{e.url.replace("https://www.toronto.ca", "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
