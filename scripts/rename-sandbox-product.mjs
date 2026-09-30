// One-time: renames the Stripe SANDBOX product behind STRIPE_PRICE_UNLOCK so
// the checkout page video 6 records reads "Pay Per Production" instead of the
// sandbox's default "Test One Production License". Refuses anything but a
// sk_test_ key, since a product name is account-wide and this must never
// touch a live product.
//
//   node scripts/rename-sandbox-product.mjs
import Stripe from "stripe";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

if (typeof env.STRIPE_SECRET_KEY !== "string" || !env.STRIPE_SECRET_KEY.startsWith("sk_test_")) {
  console.error("STRIPE_SECRET_KEY must be a sandbox key (sk_test_...). Refusing to touch a live product.");
  process.exit(1);
}
if (typeof env.STRIPE_PRICE_UNLOCK !== "string" || !env.STRIPE_PRICE_UNLOCK) {
  console.error("STRIPE_PRICE_UNLOCK is not set in .env.local.");
  process.exit(1);
}

const NEW_NAME = "Pay Per Production";
const NEW_DESCRIPTION = "One production with 3 makers included.";

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

const price = await stripe.prices.retrieve(env.STRIPE_PRICE_UNLOCK, { expand: ["product"] });
const product = price.product;
if (!product || typeof product === "string" || product.deleted) {
  console.error(`STRIPE_PRICE_UNLOCK (${env.STRIPE_PRICE_UNLOCK}) did not expand to a live product.`);
  process.exit(1);
}

console.log("Before:");
console.log(`  name:        ${product.name}`);
console.log(`  description: ${product.description ?? "(none)"}`);

const updated = await stripe.products.update(product.id, {
  name: NEW_NAME,
  description: NEW_DESCRIPTION,
});

console.log("After:");
console.log(`  name:        ${updated.name}`);
console.log(`  description: ${updated.description ?? "(none)"}`);
