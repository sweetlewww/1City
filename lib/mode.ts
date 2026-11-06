// HOSTED=true is the password-protected demo on Vercel. It never files
// anything with the City and never opens a browser: partners can ask
// questions, look up zoning and see summaries and checklists, and the video
// shows the real filing. On Mike's laptop HOSTED is unset and nothing changes.
export const HOSTED = process.env.HOSTED === "true";

export const HOSTED_FILING_OFF =
  "This is the hosted demo, so filing with the City is turned off. Nothing was sent. The demo video shows 1City filling in and submitting the City's real form from Mike's laptop.";
