export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = body;

    const crypto = await import("node:crypto");

   const generatedSignature = crypto
  .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
  .update(
    razorpay_order_id + "|" + razorpay_payment_id
  )
  .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return Response.json(
        { error: "Invalid payment signature" },
        { status: 400 }
      );
    }

    return Response.json({
      success: true,
      message: "Payment verified"
    });

  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
