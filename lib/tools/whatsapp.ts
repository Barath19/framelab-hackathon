/**
 * Twilio WhatsApp delivery.
 *
 * Sends a WhatsApp message with a media URL via the Twilio API. All four
 * env vars must be set or send() returns a clear { configured: false } so
 * the UI can degrade gracefully:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_WHATSAPP_FROM   (e.g. "whatsapp:+14155238886")
 *   TWILIO_WHATSAPP_TO     (e.g. "whatsapp:+1...")
 */

export type SendResult =
  | { configured: false; reason: string }
  | { configured: true; sid: string; status: string };

export async function sendWhatsAppVideo(opts: {
  mediaUrl: string;
  caption: string;
  to?: string;
}): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const to = opts.to || process.env.TWILIO_WHATSAPP_TO;

  if (!sid || !token || !from || !to) {
    return {
      configured: false,
      reason:
        "Missing Twilio env vars. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, and TWILIO_WHATSAPP_TO in .env.local.",
    };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const body = new URLSearchParams({
    From: from,
    To: to,
    Body: opts.caption,
    MediaUrl: opts.mediaUrl,
  });
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { sid: string; status: string };
  return { configured: true, sid: json.sid, status: json.status };
}
