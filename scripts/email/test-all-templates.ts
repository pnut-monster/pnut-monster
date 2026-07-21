import { loadLocalEnv } from "../aws/load-local-env.mjs";

async function main() {
await loadLocalEnv();

const recipient = process.argv[2] || process.env.TEST_EMAIL_RECIPIENT;
if (!recipient) {
  throw new Error("Pass a recipient: npm run email:templates:test-delivery -- user@example.com");
}

const [{ sendTemplateEmail }, { EMAIL_TEMPLATE_NAMES }] = await Promise.all([
  import("../../src/lib/email/service"),
  import("../../src/lib/email/registry"),
]);
const requestedTemplates = process.argv.slice(3);
const templates = requestedTemplates.length > 0
  ? EMAIL_TEMPLATE_NAMES.filter((name) => requestedTemplates.includes(name))
  : EMAIL_TEMPLATE_NAMES;
if (requestedTemplates.length > 0 && templates.length !== requestedTemplates.length) {
  throw new Error("One or more requested template names are invalid");
}

const data = {
  userName: "PNUT Email Tester",
  heading: "PNUT MONSTER email integration test",
  message: "This message verifies the website's S3 template, renderer, and AWS SES delivery pipeline.",
  buttonText: "Open PNUT MONSTER",
  buttonUrl: "https://pnut.monster",
  otp: "123456",
  expiryTime: "10 minutes",
  resetLink: "https://pnut.monster/reset-password?test=true",
  organizationName: "PNUT MONSTER",
  invoiceNumber: "TEST-INV-001",
  invoiceDate: new Date().toISOString().slice(0, 10),
  amount: "₹499.00",
  lineItemsHtml: '<tr><td style="padding:8px">Test item</td><td style="padding:8px;text-align:right">₹499.00</td></tr>',
  ticketNumber: "TEST-001",
  orderNumber: "TESTORDER",
  outletName: "PNUT MONSTER Test Outlet",
  orderType: "Pickup",
  paymentMethod: "Test payment",
  estimatedTime: "20 minutes",
  subtotal: "₹499.00",
  discount: "₹0.00",
  total: "₹499.00",
  itemRowsHtml: '<tr><td style="padding:8px">Test bowl × 1</td><td style="padding:8px;text-align:right">₹499.00</td></tr>',
  deliveryFeeRowHtml: "",
  discountRowHtml: "",
  newBalance: "₹999.00",
  paymentId: "pay_test_001",
};

const results: Array<{ template: string; sent: boolean; messageId?: string; error?: string }> = [];
for (const template of templates) {
  try {
    const delivery = await sendTemplateEmail({
      template,
      to: recipient,
      data,
      tags: { source: "all_templates_integration_test" },
    });
    results.push({ template, sent: true, messageId: delivery.messageId });
    console.log(`PASS ${template} ${delivery.messageId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ template, sent: false, error: message });
    console.error(`FAIL ${template} ${message}`);
  }
}

const failed = results.filter((result) => !result.sent);
console.log(JSON.stringify({ recipient, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
