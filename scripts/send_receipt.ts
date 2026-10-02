import { orderRequest, sendOrderMail } from "../src/order_mail.ts";

const to = process.env.DEMO_EMAIL_TO;
if (!to) throw new Error("Set DEMO_EMAIL_TO");
const order = orderRequest.parse({ orderId: "demo-104", to, kind: "receipt", amountCents: 2499, idempotencyKey: "demo-104-receipt" });
console.log(await sendOrderMail(order));
