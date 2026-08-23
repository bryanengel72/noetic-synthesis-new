// Contact form handler. Sends via Resend when RESEND_API_KEY is configured;
// otherwise returns ok:false so the frontend falls back to a prefilled mailto.
// The default From must live on a Resend-verified domain — send.noeticsynthesis.com
// (verified Aug 20, us-east-1). Resend 403s any other sender.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { name, email, organization, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ ok: false, error: "Missing fields" });
  }

  const key = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO || "evolve@noeticsynthesis.com";
  if (!key) {
    return res.status(200).json({ ok: false, fallback: "mailto", reason: "no-key" });
  }

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:
          process.env.CONTACT_FROM ||
          "Noetic Synthesis <inquiries@send.noeticsynthesis.com>",
        to: [to],
        reply_to: email,
        subject: `New inquiry — ${name}${organization ? " · " + organization : ""}`,
        text: `Name: ${name}\nEmail: ${email}${organization ? "\nOrganization: " + organization : ""}\n\n${message}`,
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error("contact: Resend", r.status, detail);
      return res
        .status(200)
        .json({ ok: false, fallback: "mailto", reason: `resend-${r.status}`, detail });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("contact error", err);
    return res.status(200).json({ ok: false, fallback: "mailto", reason: "exception" });
  }
}
