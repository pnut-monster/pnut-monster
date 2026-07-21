import { emailConfig } from "./config";
import { escapeHtml } from "./renderer";
import type { TemplateVariables } from "./renderer";

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

export interface PaymentReceiptData {
  amount: number;
  paymentId: string;
  orderId: string;
  method: string;
  date: string;
}

export interface WalletTopupData {
  amount: number;
  paymentId: string;
  newBalance: number;
}

export function formatEmailCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);
}

export function welcomeEmailData(name: string): TemplateVariables {
  return {
    userName: name,
    heading: `Welcome to ${emailConfig.brand.brandName}`,
    message: "Your account is ready. Discover healthy favourites, earn rewards, and enjoy faster checkout.",
    buttonText: "Start ordering",
    buttonUrl: emailConfig.brand.websiteUrl,
  };
}

export function orderConfirmationEmailData(name: string, order: OrderEmailData): TemplateVariables {
  const itemRowsHtml = order.items.map((item) => {
    const itemName = escapeHtml(item.name);
    const amount = escapeHtml(formatEmailCurrency(item.price * item.quantity));
    return `<tr><td style="padding:12px 0;border-bottom:1px solid #e5e7eb;color:#202124">${itemName} × ${item.quantity}</td><td style="padding:12px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#202124">${amount}</td></tr>`;
  }).join("");

  return {
    userName: name,
    orderNumber: order.orderNumber,
    outletName: order.outletName,
    orderType: order.orderType === "delivery" ? "Delivery" : "Pickup",
    paymentMethod: order.paymentMethod,
    subtotal: formatEmailCurrency(order.subtotal),
    discount: formatEmailCurrency(order.discount),
    total: formatEmailCurrency(order.total),
    estimatedTime: order.estimatedTime || "We’ll notify you when it is ready",
    buttonUrl: `${emailConfig.brand.websiteUrl}/orders`,
    itemRowsHtml,
    deliveryFeeRowHtml: order.deliveryFee > 0
      ? `<tr><td style="padding:5px 0;color:#6b7280">Delivery</td><td style="padding:5px 0;text-align:right;color:#6b7280">${escapeHtml(formatEmailCurrency(order.deliveryFee))}</td></tr>`
      : "",
    discountRowHtml: order.discount > 0
      ? `<tr><td style="padding:5px 0;color:#15803d">Discount</td><td style="padding:5px 0;text-align:right;color:#15803d">−${escapeHtml(formatEmailCurrency(order.discount))}</td></tr>`
      : "",
  };
}

export function paymentSuccessfulEmailData(name: string, payment: PaymentReceiptData): TemplateVariables {
  return {
    userName: name,
    heading: "Payment successful",
    message: `We received ${formatEmailCurrency(payment.amount)} via ${payment.method}. Payment ID: ${payment.paymentId}.`,
    amount: formatEmailCurrency(payment.amount),
    buttonText: "View your orders",
    buttonUrl: `${emailConfig.brand.websiteUrl}/orders`,
    orderId: payment.orderId,
    paymentId: payment.paymentId,
    paymentDate: payment.date,
  };
}

export function walletTopupEmailData(name: string, topup: WalletTopupData): TemplateVariables {
  return {
    userName: name,
    amount: formatEmailCurrency(topup.amount),
    newBalance: formatEmailCurrency(topup.newBalance),
    paymentId: topup.paymentId,
  };
}
