export async function onRequestPost({ request, env }) {
  try {
    const { ebookId, customer } = await request.json();

    const ebooks = {
      "high-protein-breakfast": {
        title: "High Protein Breakfast",
        price: 299
      },
      "picky-eaters": {
        title: "Picky Eaters",
        price: 299
      }
    };

    const ebook = ebooks[ebookId];

    if (!ebook) {
      return Response.json(
        { error: "Invalid ebook" },
        { status: 400 }
      );
    }

    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_SECRET) {
      return Response.json(
        { error: "Razorpay keys not configured" },
        { status: 500 }
      );
    }

    const amount = ebook.price * 100;

    const auth = btoa(
      `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_SECRET}`
    );

    const razorpayResponse = await fetch(
      "https://api.razorpay.com/v1/orders",
      {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount: amount,
          currency: "INR",
          receipt: `ebook_${Date.now()}`,
          notes: {
            ebook: ebook.title,
            customerName: customer?.name || "",
            customerEmail: customer?.email || ""
          }
        })
      }
    );

    const order = await razorpayResponse.json();

    if (!razorpayResponse.ok) {
      return Response.json(
        {
          error: "Razorpay order creation failed",
          details: order
        },
        { status: 400 }
      );
    }

    return Response.json({
      success: true,
      keyId: env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      ebook: ebook
    });

  } catch (error) {

    return Response.json(
      {
        error: error.message
      },
      {
        status: 500
      }
    );

  }
}
