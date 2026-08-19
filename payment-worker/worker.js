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

    // --------------------------------------------------
    // Validate amount
    // --------------------------------------------------
    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json(
        {
          success: false,
          error: "Invalid amount"
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // Validate consultation
    // --------------------------------------------------
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

      // --------------------------------------------------
      // Validate eBook customer
      // --------------------------------------------------
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

    // --------------------------------------------------
    // eBook prices
    // --------------------------------------------------
   const ebookPrices = {
  "high-protein-breakfast": 299,
  "picky-eaters": 299,
  "snack-smart": 299,
  "gut-reset": 299,
  "power-lunch": 299,
  "ancient-grain-modern-plate": 299,

  // Collections
 "complete-kalpaahar-collection": 1299,
"protein-&-energy-collection": 699,
"happy-family-nutrition-collection": 699,
"gut-&-grain-wellness-collection": 749
};

    // --------------------------------------------------
    // Determine expected price
    // --------------------------------------------------
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

    // --------------------------------------------------
    // Validate product/service
    // --------------------------------------------------
    if (expectedAmount === null) {
      return Response.json(
        {
          success: false,
          error: "Invalid product or service"
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // Validate price
    // --------------------------------------------------
    if (amount !== expectedAmount) {
      return Response.json(
        {
          success: false,
          error: "Invalid amount",
          expectedAmount: expectedAmount,
          receivedAmount: amount
        },
        { status: 400 }
      );
    }

    console.log("PAYMENT DEBUG", {
      paymentType,
      service,
      ebookId,
      receivedAmount: amount,
      expectedAmount
    });

    // --------------------------------------------------
    // Validate Razorpay credentials
    // --------------------------------------------------
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

    // --------------------------------------------------
    // Create Basic Auth credentials
    // --------------------------------------------------
    const auth = btoa(
      env.RAZORPAY_KEY_ID +
      ":" +
      env.RAZORPAY_KEY_SECRET
    );

    // --------------------------------------------------
    // Create Razorpay order
    // --------------------------------------------------
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
            paymentType: paymentType,
            service: service,
            name: customer.name || "",
            email: customer.email || "",
            phone: customer.phone || "",
            ebookId: ebookId
          }
        })
      }
    );

    // --------------------------------------------------
    // Read Razorpay response
    // --------------------------------------------------
    const data = await razorpayResponse.json();

    // --------------------------------------------------
    // Handle Razorpay error
    // --------------------------------------------------
    if (!razorpayResponse.ok) {
      return Response.json(
        {
          success: false,
          error:
            data.error?.description ||
            "Razorpay order creation failed",
          razorpay: data
        },
        {
          status: razorpayResponse.status
        }
      );
    }

    // --------------------------------------------------
    // Return order details
    // --------------------------------------------------
    return Response.json({
      success: true,

      keyId: env.RAZORPAY_KEY_ID,
      orderId: data.id,
      amount: data.amount,
      currency: data.currency
    });

  } catch (error) {

    console.error(
      "Order creation error:",
      error
    );

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

    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
        }
      });
    }

    const pathname = new URL(request.url).pathname;

    // Create Razorpay order
    if (
      pathname === "/api/orders" &&
      request.method === "POST"
    ) {

      const r = await onRequestPost({
        request,
        env
      });

      const headers = new Headers(r.headers);

      headers.set(
        "Access-Control-Allow-Origin",
        "*"
      );

      headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type"
      );

      headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
      );

      return new Response(
        r.body,
        {
          status: r.status,
          headers
        }
      );
    }

    return Response.json(
      {
        success: false,
        error: "Not found"
      },
      {
        status: 404,
        headers: {
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
};
