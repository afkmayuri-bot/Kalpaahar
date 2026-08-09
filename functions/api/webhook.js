// functions/api/webhook.js
//
// Cloudflare Pages Function
// Handles Razorpay order.paid webhook and automatically
// emails the purchased eBook PDF through Resend.

const EBOOK_CATALOG = {
  "high-protein-breakfast": {
    path: "/ebooks/High-Protein-Breakfast.pdf",
    filename: "High-Protein-Breakfast.pdf",
    title: "High Protein Breakfast",
  },

  "gut-reset": {
    path: "/ebooks/Gut-Health-Reset.pdf",
    filename: "Gut-Health-Reset.pdf",
    title: "Gut Health Reset",
  },

  "power-lunch": {
    path: "/ebooks/Power-Lunch.pdf",
    filename: "Power-Lunch.pdf",
    title: "Power Lunch",
  },

  "snack-smart": {
    path: "/ebooks/Snack-Smart.pdf",
    filename: "Snack-Smart.pdf",
    title: "Snack Smart",
  },

  "ancient-grain-modern-plate": {
    path: "/ebooks/Ancient-Grain-Modern-Plate.pdf",
    filename: "Ancient-Grain-Modern-Plate.pdf",
    title: "Ancient Grain Modern Plate",
  },

  "picky-eaters": {
    path: "/ebooks/Picky-Eaters.pdf",
    filename: "Picky-Eaters.pdf",
    title: "Picky Eaters",
  },

  "move-well-home-workout-guide": {
    path: "/ebooks/Move-Well-Home-Workout-Guide.pdf",
    filename: "Move-Well-Home-Workout-Guide.pdf",
    title: "Move Well Home Workout Guide",
  },
};


// IMPORTANT:
// This email address must use your verified Resend domain.
const FROM_EMAIL = "KalpAahar <ebooks@kalpaahar.in>";


// ============================================================
// POST /api/webhook
// ============================================================

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // --------------------------------------------------------
    // 1. Read the RAW request body
    // --------------------------------------------------------
    const rawBody = await request.text();

    // Razorpay webhook signature
    const signature = request.headers.get("x-razorpay-signature");

    if (!signature) {
      console.error("Missing Razorpay webhook signature");
      return new Response("Missing signature", { status: 400 });
    }


    // --------------------------------------------------------
    // 2. Verify Razorpay webhook signature
    // --------------------------------------------------------
    if (!env.RAZORPAY_WEBHOOK_SECRET) {
      console.error("RAZORPAY_WEBHOOK_SECRET is not configured");
      return new Response("Webhook secret not configured", {
        status: 500,
      });
    }

    const isValid = await verifyWebhookSignature(
      rawBody,
      signature,
      env.RAZORPAY_WEBHOOK_SECRET
    );

    if (!isValid) {
      console.error("Invalid Razorpay webhook signature");
      return new Response("Invalid signature", { status: 401 });
    }


    // --------------------------------------------------------
    // 3. Parse verified Razorpay payload
    // --------------------------------------------------------
    const payload = JSON.parse(rawBody);

    const event = payload.event;

    console.log("Razorpay webhook event:", event);


    // We only need order.paid
    if (event !== "order.paid") {
      return new Response(
        "Ignored event: " + event,
        { status: 200 }
      );
    }


    // --------------------------------------------------------
    // 4. Get order + payment information
    // --------------------------------------------------------
    const orderEntity = payload.payload?.order?.entity;
    const paymentEntity = payload.payload?.payment?.entity;

    if (!orderEntity || !paymentEntity) {
      console.error("Malformed Razorpay webhook payload");

      return new Response("Malformed payload", {
        status: 400,
      });
    }


    // --------------------------------------------------------
    // 5. Get customer information
    // --------------------------------------------------------
    const notes = orderEntity.notes || {};

    const customerEmail =
      notes.email ||
      paymentEntity.email;

    const customerName =
      notes.name ||
      paymentEntity.contact ||
      "Customer";

    const ebookId = notes.ebookId;


    console.log("Order ID:", orderEntity.id);
    console.log("Customer email:", customerEmail);
    console.log("Customer name:", customerName);
    console.log("eBook ID:", ebookId);


    // --------------------------------------------------------
    // 6. Make sure customer email exists
    // --------------------------------------------------------
    if (!customerEmail) {
      console.error(
        "No customer email found for order:",
        orderEntity.id
      );

      // Return 200 so Razorpay does not keep retrying
      return new Response("No customer email", {
        status: 200,
      });
    }


    // --------------------------------------------------------
    // 7. Make sure ebookId exists and is valid
    // --------------------------------------------------------
    if (!ebookId || !EBOOK_CATALOG[ebookId]) {
      console.error(
        "Unknown or missing ebookId:",
        ebookId,
        "Order:",
        orderEntity.id
      );

      // Return 200 because retrying won't fix missing ebookId
      return new Response(
        "Unknown ebookId: " + ebookId,
        { status: 200 }
      );
    }


    const ebook = EBOOK_CATALOG[ebookId];


    // --------------------------------------------------------
    // 8. Optional duplicate protection using Cloudflare KV
    // --------------------------------------------------------
    //
    // If you create EBOOK_SENT_KV later, this prevents the same
    // eBook from being emailed twice if Razorpay retries webhook.
    //

    if (env.EBOOK_SENT_KV) {
      const alreadySent =
        await env.EBOOK_SENT_KV.get(orderEntity.id);

      if (alreadySent) {
        console.log(
          "eBook already delivered for:",
          orderEntity.id
        );

        return new Response("Already delivered", {
          status: 200,
        });
      }
    }


    // --------------------------------------------------------
    // 9. Send eBook through Resend
    // --------------------------------------------------------
    await sendEbookEmail(
      env,
      customerEmail,
      customerName,
      ebook,
      request
    );


    // --------------------------------------------------------
    // 10. Mark order as delivered
    // --------------------------------------------------------
    if (env.EBOOK_SENT_KV) {
      await env.EBOOK_SENT_KV.put(
        orderEntity.id,
        "1",
        {
          expirationTtl: 60 * 60 * 24,
        }
      );
    }


    console.log(
      "eBook successfully sent to:",
      customerEmail
    );


    return new Response("OK", {
      status: 200,
    });

  } catch (error) {

    console.error(
      "Webhook error:",
      error
    );

    // 500 tells Razorpay to retry
    return new Response(
      "Server error",
      { status: 500 }
    );
  }
}


// ============================================================
// Reject GET requests
// ============================================================

export async function onRequestGet() {
  return new Response(
    "Method not allowed",
    { status: 405 }
  );
}


// ============================================================
// Razorpay Webhook Signature Verification
// ============================================================

async function verifyWebhookSignature(
  rawBody,
  signature,
  secret
) {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );


  const signatureBuffer =
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(rawBody)
    );


  const expectedSignature =
    bufferToHex(signatureBuffer);


  return timingSafeEqual(
    expectedSignature,
    signature
  );
}


// ============================================================
// Convert ArrayBuffer to hexadecimal string
// ============================================================

function bufferToHex(buffer) {
  return Array.from(
    new Uint8Array(buffer)
  )
    .map((byte) =>
      byte.toString(16).padStart(2, "0")
    )
    .join("");
}


// ============================================================
// Constant-time comparison
// ============================================================

function timingSafeEqual(a, b) {

  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |=
      a.charCodeAt(i) ^
      b.charCodeAt(i);
  }

  return result === 0;
}


// ============================================================
// Send eBook email using Resend
// ============================================================

async function sendEbookEmail(
  env,
  toEmail,
  toName,
  ebook,
  request
) {

  // ----------------------------------------------------------
  // 1. Build PDF URL from your deployed website
  // ----------------------------------------------------------

  const origin =
    new URL(request.url).origin;

  const pdfUrl =
    origin + ebook.path;


  console.log(
    "Fetching PDF:",
    pdfUrl
  );


  // ----------------------------------------------------------
  // 2. Fetch PDF
  // ----------------------------------------------------------

  const pdfResponse =
    await fetch(pdfUrl);


  if (!pdfResponse.ok) {

    throw new Error(
      "Could not fetch eBook PDF: " +
      pdfUrl +
      " Status: " +
      pdfResponse.status
    );
  }


  // ----------------------------------------------------------
  // 3. Convert PDF to Base64
  // ----------------------------------------------------------

  const pdfArrayBuffer =
    await pdfResponse.arrayBuffer();

  const pdfBase64 =
    arrayBufferToBase64(
      pdfArrayBuffer
    );


  // ----------------------------------------------------------
  // 4. Prepare email
  // ----------------------------------------------------------

  const emailPayload = {

    from: FROM_EMAIL,

    to: [
      toEmail
    ],

    subject:
      `Your ${ebook.title} eBook is here 🎉`,

    html: `
      <div
        style="
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #222;
          max-width: 600px;
          margin: auto;
        "
      >

        <h2>
          Hi ${escapeHtml(toName)},
        </h2>

        <p>
          Thank you for your purchase!
        </p>

        <p>
          Your
          <strong>
            ${escapeHtml(ebook.title)}
          </strong>
          eBook is attached to this email.
        </p>

        <p>
          We hope it helps you on your health journey.
        </p>

        <p>
          Warm regards,<br>
          <strong>Dr. Sayali Nahar</strong><br>
          KalpAahar
        </p>

      </div>
    `,

    attachments: [
      {
        filename: ebook.filename,
        content: pdfBase64,
      },
    ],
  };


  // ----------------------------------------------------------
  // 5. Send through Resend
  // ----------------------------------------------------------

  if (!env.RESEND_API_KEY) {

    throw new Error(
      "RESEND_API_KEY is not configured"
    );
  }


  const resendResponse =
    await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",

        headers: {
          "Authorization":
            "Bearer " +
            env.RESEND_API_KEY,

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify(
            emailPayload
          ),
      }
    );


  // ----------------------------------------------------------
  // 6. Check Resend response
  // ----------------------------------------------------------

  if (!resendResponse.ok) {

    const errorText =
      await resendResponse.text();

    console.error(
      "Resend error:",
      errorText
    );

    throw new Error(
      "Resend API error: " +
      errorText
    );
  }


  const resendResult =
    await resendResponse.json();

  console.log(
    "Resend email sent:",
    resendResult
  );
}


// ============================================================
// Convert PDF ArrayBuffer to Base64
// ============================================================

function arrayBufferToBase64(buffer) {

  let binary = "";

  const bytes =
    new Uint8Array(buffer);

  const chunkSize =
    0x8000;

  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {

    binary += String.fromCharCode(
      ...bytes.subarray(
        i,
        i + chunkSize
      )
    );
  }

  return btoa(binary);
}


// ============================================================
// HTML escaping
// ============================================================

function escapeHtml(str) {

  return String(str)
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}
