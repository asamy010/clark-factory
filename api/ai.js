export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: { message: "POST only" } });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: { message: "ANTHROPIC_API_KEY not set in Vercel Environment Variables" } });
  try {
    const { system, messages } = req.body;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: system || "",
        messages: messages || []
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: { message: data.error?.message || "API error: " + r.status } });
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
}
