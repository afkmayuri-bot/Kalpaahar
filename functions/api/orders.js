export async function onRequestPost({ request, env }) {
  try {

   const body = await request.json();

console.log("ORDER REQUEST:", body);
console.log("RAZORPAY KEY:", env.RAZORPAY_KEY_ID);    const {
      ebookId,
      customer
    } = body;


    const ebooks = {

      "high-protein-breakfast": {
        title: "High Protein Breakfast",
        price: 299
      },

      "picky-eaters": {
        title: "Picky Eaters",
        price: 299
      },

      "gut-reset": {
        title: "Gut Reset",
        price: 299
      },

      "snack-smart": {
        title: "Snack Smart",
        price: 299
      },

      "power-lunch": {
        title: "Power Lunch",
        price: 299
      },

      "ancient-grain-modern-plate": {
        title: "Ancient Grain, Modern Plate",
        price: 299
      }

    };


    const ebook = ebooks[ebookId];


    if (!ebook) {
      return Response.json(
        {
          error: "Invalid ebook",
          receivedId: ebookId
        },
        {
          status: 400
        }
      );
    }



    const razorpayResponse = await fetch(
      "https://api.razorpay.com/v1/orders",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          "Authorization":
            "Basic " +
            btoa(
              env.RAZORPAY_KEY_ID +
              ":" +
              env.RAZORPAY_KEY_SECRET
            )
        },


        body: JSON.stringify({

          amount: ebook.price * 100,

          currency: "INR",

          receipt:
            "ebook_" + Date.now(),

          notes: {

            ebook:
              ebook.title,

            email:
              customer?.email || ""

          }

        })

      }
    );



    const order =
      await razorpayResponse.json();



    if (!razorpayResponse.ok) {

      return Response.json(

        {
          error:
            "Razorpay order creation failed",

          details:
            order

        },

        {
          status: 400
        }

      );

    }



    return Response.json({
  success: true,

  data: {
    keyId: env.RAZORPAY_KEY_ID,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency
  },

  ebook: {
    title: ebook.title
  }
});
  } catch (error) {


    return Response.json(

      {
        error:
          error.message
      },

      {
        status: 500
      }

    );

  }

}
