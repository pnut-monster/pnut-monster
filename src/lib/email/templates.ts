function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PNUT Monster</title>
</head>
<body style="margin:0;padding:0;background-color:#f7f8fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f8fa;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background-color:#4CAF50;padding:24px 32px;text-align:center;">
              <h1 style="margin:0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">PNUT MONSTER</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;border-top:1px solid #eee;text-align:center;">
              <p style="margin:0;font-size:12px;color:#999;">
                &copy; ${new Date().getFullYear()} PNUT Monster. All rights reserved.
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#bbb;">
                This is a transactional email. You received this because you have an account with us.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function formatCurrency(amount: number): string {
  return `₹${amount.toFixed(2)}`;
}

// ─── Welcome Email ────────────────────────────────────────────────────────────

export function welcomeEmail(name: string): { subject: string; html: string; text: string } {
  const subject = "Welcome to PNUT Monster! 🥜";

  const html = baseLayout(`
    <h2 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;">Hey ${name}! 👋</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#444;line-height:1.6;">
      Welcome to <strong>PNUT Monster</strong> — your go-to spot for delicious, healthy food delivered right to your door.
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#444;line-height:1.6;">
      Here's what you can do:
    </p>
    <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#444;line-height:1.8;">
      <li>Browse our menu and order your favorites</li>
      <li>Add money to your wallet for faster checkout</li>
      <li>Earn loyalty points with every order</li>
      <li>Refer friends and earn rewards</li>
    </ul>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        <td style="background-color:#4CAF50;border-radius:8px;padding:12px 32px;">
          <a href="${process.env.NEXT_PUBLIC_SITE_URL || "https://pnutmonster.com"}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">
            Start Ordering →
          </a>
        </td>
      </tr>
    </table>
  `);

  const text = `Hey ${name}!\n\nWelcome to PNUT Monster — your go-to spot for delicious, healthy food.\n\nStart ordering at ${process.env.NEXT_PUBLIC_SITE_URL || "https://pnutmonster.com"}`;

  return { subject, html, text };
}

// ─── Order Confirmation ───────────────────────────────────────────────────────

export interface OrderEmailData {
  orderNumber: string;
  items: { name: string; quantity: number; price: number }[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  paymentMethod: string;
  outletName: string;
  orderType: string;
  estimatedTime?: string;
}

export function orderConfirmationEmail(
  name: string,
  order: OrderEmailData
): { subject: string; html: string; text: string } {
  const subject = `Order Confirmed #${order.orderNumber}`;

  const itemRows = order.items
    .map(
      (item) => `
    <tr>
      <td style="padding:8px 0;font-size:14px;color:#333;border-bottom:1px solid #f0f0f0;">
        ${item.name} × ${item.quantity}
      </td>
      <td style="padding:8px 0;font-size:14px;color:#333;text-align:right;border-bottom:1px solid #f0f0f0;">
        ${formatCurrency(item.price * item.quantity)}
      </td>
    </tr>`
    )
    .join("");

  const html = baseLayout(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#1a1a1a;">Order Confirmed! ✅</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#666;">
      Hi ${name}, your order has been placed successfully.
    </p>

    <!-- Order Info -->
    <div style="background:#f8faf8;border-radius:8px;padding:16px;margin-bottom:24px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#555;">
        <tr>
          <td style="padding:4px 0;"><strong>Order #</strong></td>
          <td style="text-align:right;">${order.orderNumber}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;"><strong>Outlet</strong></td>
          <td style="text-align:right;">${order.outletName}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;"><strong>Type</strong></td>
          <td style="text-align:right;">${order.orderType === "delivery" ? "Delivery" : "Pickup"}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;"><strong>Payment</strong></td>
          <td style="text-align:right;">${order.paymentMethod}</td>
        </tr>
        ${order.estimatedTime ? `<tr><td style="padding:4px 0;"><strong>Est. Time</strong></td><td style="text-align:right;">${order.estimatedTime}</td></tr>` : ""}
      </table>
    </div>

    <!-- Items -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td style="padding:8px 0;font-size:12px;font-weight:700;color:#999;text-transform:uppercase;border-bottom:2px solid #eee;">Items</td>
        <td style="padding:8px 0;font-size:12px;font-weight:700;color:#999;text-transform:uppercase;text-align:right;border-bottom:2px solid #eee;">Amount</td>
      </tr>
      ${itemRows}
    </table>

    <!-- Totals -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#666;">Subtotal</td>
        <td style="padding:4px 0;font-size:13px;color:#666;text-align:right;">${formatCurrency(order.subtotal)}</td>
      </tr>
      ${order.deliveryFee > 0 ? `<tr><td style="padding:4px 0;font-size:13px;color:#666;">Delivery Fee</td><td style="padding:4px 0;font-size:13px;color:#666;text-align:right;">${formatCurrency(order.deliveryFee)}</td></tr>` : ""}
      ${order.discount > 0 ? `<tr><td style="padding:4px 0;font-size:13px;color:#4CAF50;">Discount</td><td style="padding:4px 0;font-size:13px;color:#4CAF50;text-align:right;">-${formatCurrency(order.discount)}</td></tr>` : ""}
      <tr>
        <td style="padding:12px 0 0;font-size:16px;font-weight:700;color:#1a1a1a;border-top:2px solid #eee;">Total Paid</td>
        <td style="padding:12px 0 0;font-size:16px;font-weight:700;color:#1a1a1a;text-align:right;border-top:2px solid #eee;">${formatCurrency(order.total)}</td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#999;text-align:center;">
      Track your order in the app for real-time updates.
    </p>
  `);

  const itemsText = order.items.map((i) => `  ${i.name} × ${i.quantity} — ${formatCurrency(i.price * i.quantity)}`).join("\n");
  const text = `Order Confirmed #${order.orderNumber}\n\nHi ${name},\n\nItems:\n${itemsText}\n\nTotal: ${formatCurrency(order.total)}\nPayment: ${order.paymentMethod}\nOutlet: ${order.outletName}`;

  return { subject, html, text };
}

// ─── Payment Receipt ──────────────────────────────────────────────────────────

export interface PaymentReceiptData {
  amount: number;
  paymentId: string;
  orderId: string;
  method: string;
  date: string;
}

export function paymentReceiptEmail(
  name: string,
  payment: PaymentReceiptData
): { subject: string; html: string; text: string } {
  const subject = `Payment Receipt — ${formatCurrency(payment.amount)}`;

  const html = baseLayout(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#1a1a1a;">Payment Successful 💳</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#666;">
      Hi ${name}, here's your payment receipt.
    </p>

    <div style="background:#f8faf8;border-radius:8px;padding:20px;margin-bottom:24px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#333;">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;"><strong>Amount</strong></td>
          <td style="padding:8px 0;text-align:right;border-bottom:1px solid #eee;font-size:18px;font-weight:700;color:#4CAF50;">${formatCurrency(payment.amount)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">Payment ID</td>
          <td style="padding:8px 0;text-align:right;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;">${payment.paymentId}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">Order ID</td>
          <td style="padding:8px 0;text-align:right;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;">${payment.orderId}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">Method</td>
          <td style="padding:8px 0;text-align:right;border-bottom:1px solid #eee;">${payment.method}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;">Date</td>
          <td style="padding:8px 0;text-align:right;">${payment.date}</td>
        </tr>
      </table>
    </div>

    <p style="margin:0;font-size:13px;color:#999;text-align:center;">
      Keep this email for your records. No action required.
    </p>
  `);

  const text = `Payment Receipt\n\nHi ${name},\n\nAmount: ${formatCurrency(payment.amount)}\nPayment ID: ${payment.paymentId}\nOrder ID: ${payment.orderId}\nMethod: ${payment.method}\nDate: ${payment.date}`;

  return { subject, html, text };
}

// ─── Wallet Top-up Receipt ────────────────────────────────────────────────────

export interface WalletTopupData {
  amount: number;
  paymentId: string;
  newBalance: number;
}

export function walletTopupEmail(
  name: string,
  topup: WalletTopupData
): { subject: string; html: string; text: string } {
  const subject = `Wallet Topped Up — ${formatCurrency(topup.amount)} added`;

  const html = baseLayout(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#1a1a1a;">Wallet Top-up Successful 💰</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#666;">
      Hi ${name}, your wallet has been credited.
    </p>

    <div style="background:linear-gradient(135deg,#4CAF50,#388E3C);border-radius:12px;padding:24px;margin-bottom:24px;text-align:center;">
      <p style="margin:0 0 4px;font-size:12px;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:1px;">Amount Added</p>
      <p style="margin:0 0 16px;font-size:32px;font-weight:800;color:#ffffff;">${formatCurrency(topup.amount)}</p>
      <div style="border-top:1px solid rgba(255,255,255,0.2);padding-top:16px;">
        <p style="margin:0 0 4px;font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1px;">New Balance</p>
        <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${formatCurrency(topup.newBalance)}</p>
      </div>
    </div>

    <div style="background:#f8f8f8;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#555;">
        <tr>
          <td>Transaction ID</td>
          <td style="text-align:right;font-family:monospace;font-size:11px;">${topup.paymentId}</td>
        </tr>
      </table>
    </div>

    <p style="margin:0;font-size:13px;color:#999;text-align:center;">
      Use your wallet balance for faster, cashless checkout.
    </p>
  `);

  const text = `Wallet Top-up Successful\n\nHi ${name},\n\nAmount Added: ${formatCurrency(topup.amount)}\nNew Balance: ${formatCurrency(topup.newBalance)}\nTransaction: ${topup.paymentId}`;

  return { subject, html, text };
}
