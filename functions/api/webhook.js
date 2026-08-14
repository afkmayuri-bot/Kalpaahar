// functions/api/webhook.js
//
// Cloudflare Pages Function
// Handles Razorpay order.paid webhook and emails:
// - Purchased individual eBook
// - Purchased combo eBooks
// - Free Move Well Home Workout Guide bonus
// through Resend.


// ============================================================
// EBOOK FILE CATALOG
// ============================================================

const FILES = {

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
  path: "/ebooks/Ancient Grain, Modern Plate.pdf",
  filename: "Ancient Grain, Modern Plate.pdf",
  title: "Ancient Grain, Modern Plate",
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


// ============================================================
// COMBO CATALOG
// ============================================================

const COMBOS = {

  // All 6 nutrition eBooks
  "complete-kalpaahar-collection": [
    "high-protein-breakfast",
    "gut-reset",
    "power-lunch",
    "snack-smart",
    "ancient-grain-modern-plate",
    "picky-eaters",
  ],

  // High Protein Breakfast + Power Lunch + Snack Smart
  "protein-&-energy-collection": [
    "high-protein-breakfast",
    "power-lunch",
    "snack-smart",
  ],

  // Picky Eaters + High Protein Breakfast + Snack Smart
  "happy-family-nutrition-collection": [
    "picky-eaters",
    "high-protein-breakfast",
    "snack-smart",
  ],

  // Gut Reset + Ancient Grain Modern Plate + High Protein Breakfast
  "gut-&-grain-wellness-collection": [
    "gut-reset",
    "ancient-grain-modern-plate",
    "high-protein-breakfast",
  ],

};


// ============================================================
// FREE BONUS
// ============================================================

const BONUS_EBOOK_ID =
  "move-well-home-workout-guide";


// ============================================================
// RESEND FROM EMAIL
// ============================================================

const FROM_EMAIL =
  "KalpAahar <ebooks@kalpaahar.in>";


// ============================================================
// POST /api/webhook
// ============================================================

export async function onRequestPost(context) {

  const { request, env } = context;

  try {

    // --------------------------------------------------------
    // 1. Read RAW webhook body
    // --------------------------------------------------------

    const rawBody =
      await request.text();

    const signature =
      request.headers.get(
        "x-razorpay-signature"
      );

    if (!signature) {

      console.error(
        "Missing Razorpay webhook signature"
      );

      return new Response(
        "Missing signature",
        { status: 400 }
      );
    }


    // --------------------------------------------------------
    // 2. Check webhook secret
    // --------------------------------------------------------

    if (!env.RAZORPAY_WEBHOOK_SECRET) {

      console.error(
        "RAZORPAY_WEBHOOK_SECRET is not configured"
      );

      return new Response(
        "Webhook secret not configured",
        { status: 500 }
      );
    }


    // --------------------------------------------------------
    // 3. Verify Razorpay signature
    // --------------------------------------------------------

    const isValid =
      await verifyWebhookSignature(
        rawBody,
        signature,
        env.RAZORPAY_WEBHOOK_SECRET
      );

    if (!isValid) {

      console.error(
        "Invalid Razorpay webhook signature"
      );

      return new Response(
        "Invalid signature",
        { status: 401 }
      );
    }


    // --------------------------------------------------------
    // 4. Parse verified payload
    // --------------------------------------------------------

    const payload =
      JSON.parse(rawBody);

    const event =
      payload.event;

    console.log(
      "Razorpay webhook event:",
      event
    );


    // --------------------------------------------------------
    // 5. Only process order.paid
    // --------------------------------------------------------

    if (event !== "order.paid") {

      return new Response(
        "Ignored event: " + event,
        { status: 200 }
      );
    }


    // --------------------------------------------------------
    // 6. Get order + payment
    // --------------------------------------------------------

    const orderEntity =
      payload.payload?.order?.entity;

    const paymentEntity =
      payload.payload?.payment?.entity;

    if (!orderEntity || !paymentEntity) {

      console.error(
        "Malformed Razorpay webhook payload"
      );

      return new Response(
        "Malformed payload",
        { status: 400 }
      );
    }


    // --------------------------------------------------------
    // 7. Customer information
    // --------------------------------------------------------

    const notes =
      orderEntity.notes || {};

    const customerEmail =
      notes.email ||
      paymentEntity.email;

    const customerName =
      notes.name ||
      "Customer";

    const ebookId =
      String(notes.ebookId || "");

    const paymentType =
      String(notes.paymentType || "");

    const service =
      String(notes.service || "");


    console.log(
      "Order ID:",
      orderEntity.id
    );

    console.log(
      "Customer email:",
      customerEmail
    );

    console.log(
      "Customer name:",
      customerName
    );

    console.log(
      "eBook ID:",
      ebookId
    );

    console.log(
      "Payment type:",
      paymentType
    );

    console.log(
      "Service:",
      service
    );


    // --------------------------------------------------------
    // 8. Email required
    // --------------------------------------------------------

    if (!customerEmail) {

      console.error(
        "No customer email found for order:",
        orderEntity.id
      );

      return new Response(
        "No customer email",
        { status: 200 }
      );
    }


    // --------------------------------------------------------
    // 9. Consultation payments
    // --------------------------------------------------------

    if (
      paymentType === "consultation"
    ) {

      console.log(
        "Consultation payment received. No eBook email required."
      );

      return new Response(
        "Consultation payment received",
        { status: 200 }
      );
    }


    // --------------------------------------------------------
    // 10. Determine purchased files
    // --------------------------------------------------------

    let purchasedIds = [];

    let purchaseTitle = "";


    // Individual eBook
    if (
      FILES[ebookId] &&
      ebookId !== BONUS_EBOOK_ID
    ) {

      purchasedIds = [
        ebookId
      ];

      purchaseTitle =
        FILES[ebookId].title;
    }


    // Combo
    else if (
      COMBOS[ebookId]
    ) {

      purchasedIds =
        COMBOS[ebookId];

      purchaseTitle =
        getComboTitle(ebookId);
    }


    // Unknown product
    else {

      console.error(
        "Unknown or missing ebookId:",
        ebookId,
        "Order:",
        orderEntity.id
      );

      return new Response(
        "Unknown ebookId: " + ebookId,
        { status: 200 }
      );
    }


    // --------------------------------------------------------
    // 11. Add FREE workout bonus
    // --------------------------------------------------------

    if (
      !purchasedIds.includes(
        BONUS_EBOOK_ID
      )
    ) {

      purchasedIds.push(
        BONUS_EBOOK_ID
      );
    }


    console.log(
      "Files to deliver:",
      purchasedIds
    );


    // --------------------------------------------------------
    // 12. Validate every file
    // --------------------------------------------------------

    const ebooksToSend =
      purchasedIds.map(function(id) {

        if (!FILES[id]) {

          throw new Error(
            "File not found in catalog: " + id
          );
        }

        return FILES[id];

      });


    // --------------------------------------------------------
    // 13. Duplicate protection
    // --------------------------------------------------------

    if (env.EBOOK_SENT_KV) {

      const alreadySent =
        await env.EBOOK_SENT_KV.get(
          orderEntity.id
        );

      if (alreadySent) {

        console.log(
          "eBooks already delivered for:",
          orderEntity.id
        );

        return new Response(
          "Already delivered",
          { status: 200 }
        );
      }
    }


    // --------------------------------------------------------
    // 14. Send email
    // --------------------------------------------------------

    await sendEbookEmail(
      env,
      customerEmail,
      customerName,
      ebooksToSend,
      purchaseTitle,
      request
    );


    // --------------------------------------------------------
    // 15. Mark delivered
    // --------------------------------------------------------

    if (env.EBOOK_SENT_KV) {

      await env.EBOOK_SENT_KV.put(
        orderEntity.id,
        "1",
        {
          expirationTtl:
            60 * 60 * 24 * 30
        }
      );
    }


    console.log(
      "eBook email successfully sent to:",
      customerEmail
    );


    return new Response(
      "OK",
      { status: 200 }
    );


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
// GET
// ============================================================

export async function onRequestGet() {

  return new Response(
    "Method not allowed",
    { status: 405 }
  );
}


// ============================================================
// COMBO TITLES
// ============================================================

function getComboTitle(id) {

  const titles = {

    "complete-kalpaahar-collection":
      "Complete KalpAahar Collection",

    "protein-&-energy-collection":
      "Protein & Energy Collection",

    "happy-family-nutrition-collection":
      "Happy Family Nutrition Collection",

    "gut-&-grain-wellness-collection":
      "Gut & Grain Wellness Collection",

  };

  return titles[id] || "KalpAahar Collection";
}


// ============================================================
// VERIFY RAZORPAY WEBHOOK SIGNATURE
// ============================================================

async function verifyWebhookSignature(
  rawBody,
  signature,
  secret
) {

  const encoder =
    new TextEncoder();

  const key =
    await crypto.subtle.importKey(
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
    bufferToHex(
      signatureBuffer
    );


  return timingSafeEqual(
    expectedSignature,
    signature
  );
}


// ============================================================
// ARRAY BUFFER → HEX
// ============================================================

function bufferToHex(buffer) {

  return Array.from(
    new Uint8Array(buffer)
  )
    .map(function(byte) {

      return byte
        .toString(16)
        .padStart(2, "0");

    })
    .join("");
}


// ============================================================
// CONSTANT-TIME COMPARISON
// ============================================================

function timingSafeEqual(
  a,
  b
) {

  if (
    a.length !==
    b.length
  ) {

    return false;
  }

  let result = 0;

  for (
    let i = 0;
    i < a.length;
    i++
  ) {

    result |=
      a.charCodeAt(i) ^
      b.charCodeAt(i);
  }

  return result === 0;
}


// ============================================================
// SEND EBOOK EMAIL
// ============================================================

async function sendEbookEmail(
  env,
  toEmail,
  toName,
  ebooks,
  purchaseTitle,
  request
) {

  // ----------------------------------------------------------
  // 1. Build attachments
  // ----------------------------------------------------------

  const attachments = [];


  for (
    const ebook of ebooks
  ) {

    const origin =
      new URL(request.url).origin;

    const pdfUrl =
      origin + ebook.path;


    console.log(
      "Fetching PDF:",
      pdfUrl
    );


    // --------------------------------------------------------
    // Fetch PDF
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // Convert PDF to Base64
    // --------------------------------------------------------

    const pdfArrayBuffer =
      await pdfResponse.arrayBuffer();

    const pdfBase64 =
      arrayBufferToBase64(
        pdfArrayBuffer
      );


    attachments.push({

      filename:
        ebook.filename,

      content:
        pdfBase64,

    });

  }


  // ----------------------------------------------------------
  // 2. Build email
  // ----------------------------------------------------------

  const emailPayload = {

    from:
      FROM_EMAIL,

    to: [
      toEmail
    ],

    subject:
      `Your ${purchaseTitle} is here 🎉`,

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
          Thank you for your purchase! 🎉
        </p>

        <p>
          Your
          <strong>
            ${escapeHtml(purchaseTitle)}
          </strong>
          is attached to this email.
        </p>

        <p>
          🎁 We have also included your
          <strong>
            free Move Well Home Workout Guide
          </strong>
          as a bonus.
        </p>

        <p>
          Please check the attachments in this email
          to access your PDFs.
        </p>

        <p>
          We hope these resources help you
          on your health journey.
        </p>

        <p>
          Warm regards,<br>
          <strong>Dr. Sayali Nahar</strong><br>
          KalpAahar
        </p>

      </div>

    `,

    attachments:
      attachments,

  };


  // ----------------------------------------------------------
  // 3. Resend API key
  // ----------------------------------------------------------

  if (
    !env.RESEND_API_KEY
  ) {

    throw new Error(
      "RESEND_API_KEY is not configured"
    );
  }


  // ----------------------------------------------------------
  // 4. Send through Resend
  // ----------------------------------------------------------

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
  // 5. Check response
  // ----------------------------------------------------------

  if (
    !resendResponse.ok
  ) {

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
// ARRAY BUFFER → BASE64
// ============================================================

function arrayBufferToBase64(
  buffer
) {

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

    binary +=
      String.fromCharCode(
        ...bytes.subarray(
          i,
          i + chunkSize
        )
      );
  }


  return btoa(
    binary
  );
}


// ============================================================
// HTML ESCAPING
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