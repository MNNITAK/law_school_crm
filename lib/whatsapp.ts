import "server-only";

/**
 * Meta WhatsApp Cloud API wrapper (trial: free test number, up to 5 verified recipients).
 * Env: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN
 */
const GRAPH = "https://graph.facebook.com/v21.0";

export function waConfigured() {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export async function sendWhatsAppText(
  to: string,
  body: string
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!waConfigured()) return { ok: false, error: "wa_unconfigured" };
  const res = await fetch(
    `${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizePhone(to),
        type: "text",
        text: { preview_url: false, body },
      }),
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message?: string };
  };
  if (!res.ok)
    return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` };
  return { ok: true, id: data.messages?.[0]?.id };
}

/** wa.me deep link for "assisted send" when the recipient isn't a registered test number. */
export function waDeepLink(phone: string, text: string) {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;
}

export function normalizePhone(p: string) {
  let digits = p.replace(/[^\d]/g, "");
  if (digits.length === 10) digits = "91" + digits; // default to India country code
  return digits;
}
