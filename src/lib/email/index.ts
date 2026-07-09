export { sendEmail, isSESConfigured } from "./client";
export type { SendEmailOptions } from "./client";
export {
  welcomeEmail,
  orderConfirmationEmail,
  paymentReceiptEmail,
  walletTopupEmail,
} from "./templates";
export type { OrderEmailData, PaymentReceiptData, WalletTopupData } from "./templates";
