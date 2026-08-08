// functions/api/webhook.js
//
// Cloudflare Pages Function
// Handles Razorpay webhook events (order.paid / payment.captured)
// and automatically emails the Gut Reset eBook PDF via Resend.
//
// Required Cloudflare secrets (set via `wrangler secret put` or the
// Pages dashboard -> Settings -> Environment variables):
//   RAZORPAY_KEY_ID
//   RAZORPAY_KEY_SECRET
//   RAZORPAY_WEBHOOK_SECRET
//   RESEND_API_KEY
//
// The PDF must be committed into your Pages project so it is deployed
// as a static asset, e.g.:
//   /public/ebooks/gut-reset.pdf
// (adjust EBOOK_PATH below if you place it elsewhere)

const EBOOK_PATH = "/ebooks/gut-reset.pdf"; // served from your own Pages deployment
const EBOOK_FILENAME = "Gut-Reset-eBook.pdf";
const FROM_EMAIL = "KalpAahar <ebooks@yourdomain.com>"; // must be a domain verified in Resend

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // 1. Read raw body FIRST — signature verification needs the exact raw bytes,
    // not a re-serialized JSON string.
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature");

    if (!signature) {
      return new Response("Missing signature", { status: 400 });
    }

    // 2. Verify webhook signature using RAZORPAY_WEBHOOK_SECRET
    const isValid = await verifyWebhookSignature(
      rawBody,
      signature,
      env.RAZORPAY_WEBHOOK_SECRET
    );

    if (!isValid) {
      return new Response("Invalid signature", { status: 401 });
    }

    // 3. Parse the verified payload
    const payload = JSON.parse(rawBody);
    const event = payload.event;

    // We only act on order.paid (fires once per order, deduplicated by Razorpay)
    // payment.captured also works but can double-fire for multi-attempt payments,
    // so order.paid is the safer trigger for "one email per successful order".
    if (event !== "order.paid") {
      // Acknowledge receipt so Razorpay doesn't retry; we simply don't act on it.
      return new Response("Ignored event: " + event, { status: 200 });
    }

    const orderEntity = payload.payload?.order?.entity;
    const paymentEntity = payload.payload?.payment?.entity;

    if (!orderEntity || !paymentEntity) {
      return new Response("Malformed payload", { status: 400 });
    }

    // 4. Extract customer email + name.
    // Razorpay order "notes" is the reliable place for this — make sure
    // orders.js writes { name, email } into notes when creating the order
    // (see instructions below).
    const notes = orderEntity.notes || {};
    const customerEmail = notes.email || paymentEntity.email;
    const customerName = notes.name || "there";

    if (!customerEmail) {
      console.error("No customer email found on order/payment, order id:", orderEntity.id);
      return new Response("No email on order", { status: 200 }); // ack so Razorpay stops retrying
    }

    // 5. Idempotency guard (recommended): avoid sending twice if Razorpay
    // retries the webhook. Uses a Cloudflare KV namespace bound as env.EBOOK_SENT_KV.
    // This block is optional but strongly recommended — see setup notes below.
    if (env.EBOOK_SENT_KV) {
      const alreadySent = await env.EBOOK_SENT_KV.get(orderEntity.id);
      if (alreadySent) {
        return new Response("Already delivered", { status: 200 });
      }
    }

    // 6. Send the eBook email via Resend
    await sendEbookEmail(env, customerEmail, customerName, request);

    // 7. Mark as sent (24h TTL is plenty to cover webhook retries)
    if (env.EBOOK_SENT_KV) {
      await env.EBOOK_SENT_KV.put(orderEntity.id, "1", { expirationTtl: 60 * 60 * 24 });
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    // Return 500 so Razorpay retries the webhook later
    return new Response("Server error", { status: 500 });
  }
}

// Reject any non-POST method
export async function onRequestGet() {
  return new Response("Method not allowed", { status: 405 });
}

/**
 * Verifies Razorpay's webhook signature using HMAC-SHA256.
 * Razorpay signs: HMAC_SHA256(raw_request_body, webhook_secret)
 */
async function verifyWebhookSignature(rawBody, signature, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const expectedSignature = bufferToHex(signatureBuffer);

  return timingSafeEqual(expectedSignature, signature);
}

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Constant-time string comparison to avoid timing attacks
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Fetches the eBook PDF from your own deployed site and sends it as a
 * base64 attachment via the Resend API.
 */
async function sendEbookEmail(env, toEmail, toName, request) {
  // Build an absolute URL to the PDF on your own deployment so this works
  // both on your production domain and Pages preview URLs.
  const origin = new URL(request.url).origin;
  const pdfResponse = await fetch(origin + EBOOK_PATH);

  if (!pdfResponse.ok) {
    throw new Error("Could not fetch eBook PDF at " + EBOOK_PATH);
  }

  const pdfArrayBuffer = await pdfResponse.arrayBuffer();
  const pdfBase64 = arrayBufferToBase64(pdfArrayBuffer);

  const emailPayload = {
    from: FROM_EMAIL,
    to: [toEmail],
    subject: "Your Gut Reset eBook is here 🎉",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #222;">
        <h2>Hi ${escapeHtml(toName)},</h2>
        <p>Thank you for your purchase! Your <strong>Gut Reset eBook</strong> is attached to this email.</p>
        <p>We hope it helps you on your health journey.</p>
        <p>Warm regards,<br/>Dr. Sayali Nahar<br/>KalpAahar</p>
      </div>
    `,
    attachments: [
      {
        filename: EBOOK_FILENAME,
        content: pdfBase64,
      },
    ],
  };

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailPayload),
  });

  if (!resendResponse.ok) {
    const errText = await resendResponse.text();
    throw new Error("Resend API error: " + errText);
  }
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; // avoid call stack overflow on large files
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
