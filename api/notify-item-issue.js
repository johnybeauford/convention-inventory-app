// Vercel serverless function — emails the requester when a volunteer
// couldn't find an item while gathering their order and staff have
// decided how to handle it: either a substitution, or letting the
// requester know that item won't be available. Reuses the same
// RESEND_API_KEY already configured for the other notify endpoints.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "Email isn't configured on the server yet. Add RESEND_API_KEY in Vercel project settings.",
    });
    return;
  }

  const { requesterEmail, requester, itemName, qty, resolutionType, substituteName, note } = req.body || {};
  if (!requester || !itemName || !resolutionType) {
    res.status(400).json({ error: "Missing request details, item name, or resolution type." });
    return;
  }

  // No email on file for this requester — nothing to send, but this
  // isn't an error; staff have already recorded the resolution either way.
  if (!requesterEmail) {
    res.status(200).json({ ok: true, skipped: "no-email" });
    return;
  }

  const isSubstitute = resolutionType === "substitute";

  // Basic HTML-escaping so a name, item, or note containing &, <, or >
  // can never break the markup or inject anything into the email.
  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  const requesterName = requester.name || "—";

  // --- Plain-text fallback (some inboxes/clients show this instead) ---
  const textLines = [
    isSubstitute
      ? `A quick update on one item in your equipment request.`
      : `A quick update on one item in your equipment request — it won't be available.`,
    "",
    `Hi ${requesterName},`,
    "",
  ];
  if (isSubstitute) {
    textLines.push(
      `We weren't able to locate "${itemName}"${qty ? ` × ${qty}` : ""} while gathering your order, so we're substituting it with:`,
      "",
      `  ${substituteName || "(substitute item not specified)"}`,
      ""
    );
  } else {
    textLines.push(
      `We weren't able to locate "${itemName}"${qty ? ` × ${qty}` : ""} while gathering your order, and unfortunately it won't be available for your event.`,
      ""
    );
  }
  if (note) {
    textLines.push(`Note from staff: ${note}`, "");
  }
  textLines.push(
    "The rest of your order is unaffected. If you have any questions, please reach out to your point of contact.",
    "",
    "Thank you for your patience!",
    "CEPC-Lubbock"
  );
  const text = textLines.join("\n");

  // --- HTML version: matches the look of the other notify-*.js emails. ---
  const bodyBlockHtml = isSubstitute
    ? `
        <div style="background:#eaf3fc; border-radius:10px; padding:16px 18px; font-size:14px; color:#1a1a2e; line-height:1.6;">
          We weren't able to locate <strong>${esc(itemName)}</strong>${qty ? ` × ${esc(qty)}` : ""} while gathering your order, so we're substituting it with:
          <div style="margin-top:8px; font-size:16px; font-weight:800; color:#0072CE;">${esc(substituteName || "(substitute item not specified)")}</div>
        </div>`
    : `
        <div style="background:#fdecea; border-radius:10px; padding:16px 18px; font-size:14px; color:#1a1a2e; line-height:1.6;">
          We weren't able to locate <strong>${esc(itemName)}</strong>${qty ? ` × ${esc(qty)}` : ""} while gathering your order, and unfortunately it won't be available for your event.
        </div>`;

  const noteBlockHtml = note
    ? `
        <tr><td style="padding: 16px 36px 0; font-size:13px; color:#666; line-height:1.6;">
          <em>Note from staff: ${esc(note)}</em>
        </td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; background:#eef0f3;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f3; padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff; border-radius:4px; overflow:hidden; font-family: -apple-system, Helvetica, Arial, sans-serif;">
        <tr><td style="background:#0072CE; padding: 22px 36px;">
          <div style="font-size:15px; font-weight:800; color:#fff; letter-spacing:0.8px;">CEPC-LUBBOCK</div>
        </td></tr>

        <tr><td style="padding: 28px 36px 0;">
          <div style="font-size:21px; font-weight:700; color:#1a1a2e;">${
            isSubstitute ? "A quick update on your equipment request" : "A quick update on your equipment request"
          }</div>
        </td></tr>

        <tr><td style="padding: 14px 36px 0; font-size:15px; color:#333; line-height:1.6;">
          Hi ${esc(requesterName)},
        </td></tr>

        <tr><td style="padding: 16px 36px 0;">
          ${bodyBlockHtml}
        </td></tr>
        ${noteBlockHtml}

        <tr><td style="padding: 22px 36px 0; font-size:14px; color:#333; line-height:1.6;">
          The rest of your order is unaffected. If you have any questions, please reach out to your point of contact.
        </td></tr>

        <tr><td style="padding: 26px 36px 36px; font-size:14px; color:#333; line-height:1.6;">
          Thank you for your patience!<br/><br/>
          <span style="color:#0072CE; font-weight:800;">Warmly, CEPC-Lubbock Equipment Team</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "CEPC-Lubbock <alerts@notify.jw-inventory.com>",
        to: [requesterEmail],
        subject: isSubstitute ? "Update on your equipment request — item substituted" : "Update on your equipment request — item unavailable",
        html,
        text,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      res.status(502).json({ error: "Email service rejected the request.", detail: errText });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to send email.", detail: String(err) });
  }
}
