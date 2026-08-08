export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();

    const amount = Number(body.amount);
    const customer = body.customer || {};
    const ebookId = body.ebookId || "";

    if (!amount || amount <= 0) {
      return Response.json(
        {
          success: false,
          error: "Invalid amount"
        },
        { status: 400 }
      );
    }

    if (!customer.email) {
      return Response.json(
        {
          success: false,
          error: "Customer email is required"
        },
        { status: 400 }
      );
    }

    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
      return Response.json(
        {
          success: false,
          error: "Razorpay keys are not configured"
        },
        { status: 500 }
      );
    }

    const auth = btoa(
      env.RAZORPAY_KEY_ID + ":" + env.RAZORPAY_KEY_SECRET
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
          amount: Math.round(amount * 100),
          currency: "INR",
          receipt: "ebook_" + Date.now(),
          notes: {
            name: customer.name || "",
            email: customer.email,
            phone: customer.phone || "",
            ebookId: ebookId
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
            "Razorpay order creation failed",
          razorpay: data
        },
        { status: razorpayResponse.status }
      );
    }

    return Response.json({
      success: true,
      data: {
        keyId: env.RAZORPAY_KEY_ID,
        orderId: data.id,
        amount: data.amount,
        currency: data.currency
      }
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}
