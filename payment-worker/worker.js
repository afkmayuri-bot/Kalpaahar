async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();

    const amount = Number(body.amount);
    const customer = body.customer || {};
    const ebookId = String(body.ebookId || "");
    const paymentType = String(body.paymentType || "");
    const service = String(
      body.service ||
      body.consultationType ||
      body.plan ||
      ""
    );

    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json(
        { success: false, error: "Invalid amount" },
        { status: 400 }
      );
    }

    if (paymentType === "consultation") {
      if (!service) {
        return Response.json(
          {
            success: false,
            error: "Consultation service is required"
          },
          { status: 400 }
        );
      }
    } else {
      if (!customer.email) {
        return Response.json(
          {
            success: false,
            error: "Customer email is required"
          },
          { status: 400 }
        );
      }
    }

    const ebookPrices = {
      "high-protein-breakfast": 299,
      "picky-eaters": 299,
      "snack-smart": 299,
      "gut-reset": 299,
      "power-lunch": 299,
      "ancient-grain-modern-plate": 299,

      "complete-kalpaahar-collection": 1299,
      "protein-&-energy-collection": 699,
      "happy-family-nutrition-collection": 699,
      "gut-&-grain-wellness-collection": 749
    };

    let expectedAmount = null;

    if (
      paymentType === "consultation" &&
      service === "Quick Consultation"
    ) {
      expectedAmount = 800;
    } else if (
      paymentType === "consultation" &&
      service === "Condition-Specific Nutrition Plan"
    ) {
      expectedAmount = 2500;
    } else if (ebookPrices[ebookId]) {
      expectedAmount = ebookPrices[ebookId];
    }

    if (expectedAmount === null) {
      return Response.json(
        {
          success: false,
          error: "Invalid product or service"
        },
        { status: 400 }
      );
    }

    if (amount !== expectedAmount) {
      return Response.json(
        {
          success: false,
          error: "Invalid amount",
          expectedAmount,
          receivedAmount: amount
        },
        { status: 400 }
      );
    }

    if (
      !env.RAZORPAY_KEY_ID ||
      !env.RAZORPAY_KEY_SECRET
    ) {
      return Response.json(
        {
          success: false,
          error: "Razorpay keys are not configured"
        },
        { status: 500 }
      );
    }

    const auth = btoa(
      env.RAZORPAY_KEY_ID +
      ":" +
      env.RAZORPAY_KEY_SECRET
    );

    const razorpayResponse = await fetch(
      "https://api.razorpay.com/v1/orders",
      {
        method: "POST",
        headers: {
          "Authorization": "Basic " + auth,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount: Math.round(expectedAmount * 100),
          currency: "INR",
          receipt:
            (paymentType === "consultation"
              ? "consultation_"
              : "ebook_") + Date.now(),
          notes: {
            paymentType,
            service,
            name: customer.name || "",
            email: customer.email || "",
            phone: customer.phone || "",
            ebookId
          }
        })
      }
    );

    const data = await razorpayResponse.json();

    if (!razorpayResponse.ok) {
      return Response.json(
        {
          success: false,
          error:
            data.error?.description ||
            "Razorpay order creation failed"
        },
        { status: razorpayResponse.status }
      );
    }

    return Response.json({
      success: true,
      keyId: env.RAZORPAY_KEY_ID,
      orderId: data.id,
      amount: data.amount,
      currency: data.currency
    });

  } catch (error) {
    console.error("Order creation error:", error);

    return Response.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}


async function verifyPayment({ request, env }) {
  try {
    const body = await request.json();

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = body;

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return Response.json(
        {
          success: false,
          error: "Missing Razorpay payment details"
        },
        { status: 400 }
      );
    }

    if (!env.RAZORPAY_KEY_SECRET) {
      return Response.json(
        {
          success: false,
          error: "Razorpay secret is not configured"
        },
        { status: 500 }
      );
    }

    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(env.RAZORPAY_KEY_SECRET),
      {
        name: "HMAC",
        hash: "SHA-256"
      },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(
        razorpay_order_id + "|" + razorpay_payment_id
      )
    );

    const generatedSignature = Array.from(
      new Uint8Array(signatureBuffer)
    )
      .map(function(byte) {
        return byte.toString(16).padStart(2, "0");
      })
      .join("");

    if (generatedSignature !== razorpay_signature) {
      return Response.json(
        {
          success: false,
          error: "Invalid payment signature"
        },
        { status: 400 }
      );
    }

    console.log(
      "Razorpay payment verified:",
      razorpay_payment_id
    );

    return Response.json({
      success: true,
      verified: true,
      message: "Payment verified",
      paymentId: razorpay_payment_id
    });

  } catch (error) {
    console.error("Payment verification error:", error);

    return Response.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}


export default {
  async fetch(request, env) {

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders
      });
    }

    const pathname = new URL(request.url).pathname;


    // ================================
    // CREATE RAZORPAY ORDER
    // ================================

    if (
      pathname === "/api/orders" &&
      request.method === "POST"
    ) {
      const r = await onRequestPost({
        request,
        env
      });

      const headers = new Headers(corsHeaders);

      if (r.headers) {
        r.headers.forEach((value, key) => {
          headers.set(key, value);
        });
      }

      return new Response(r.body, {
        status: r.status,
        headers
      });
    }


    // ================================
    // VERIFY RAZORPAY PAYMENT
    // ================================

    if (
      pathname === "/api/verify" &&
      request.method === "POST"
    ) {
      const r = await verifyPayment({
        request,
        env
      });

      const headers = new Headers(corsHeaders);

      if (r.headers) {
        r.headers.forEach((value, key) => {
          headers.set(key, value);
        });
      }

      return new Response(r.body, {
        status: r.status,
        headers
      });
    }


    // ================================
    // NOT FOUND
    // ================================

    return Response.json(
      {
        success: false,
        error: "Not found"
      },
      {
        status: 404,
        headers: corsHeaders
      }
    );
  }
};