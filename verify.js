export async function onRequestPost({ request, env }) {
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

    // Create HMAC-SHA256 using Cloudflare Web Crypto
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
    console.error(
      "Payment verification error:",
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
