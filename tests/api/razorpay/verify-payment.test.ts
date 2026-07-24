import { vi, describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/razorpay/verify-payment/route";

// Mock modules
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  consumeRateLimit: vi.fn(),
  requestIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendTemplateEmail: vi.fn(),
}));

vi.mock("@/lib/email/templates", () => ({
  orderConfirmationEmailData: vi.fn(),
  paymentSuccessfulEmailData: vi.fn(),
}));

const mockPaymentsFetch = vi.fn();
const mockOrdersFetch = vi.fn();

vi.mock("razorpay", () => {
  return {
    default: class MockRazorpay {
      payments = {
        fetch: mockPaymentsFetch,
      };
      orders = {
        fetch: mockOrdersFetch,
      };
    },
  };
});

vi.mock("crypto", async () => {
  const actual = await vi.importActual<typeof import("crypto")>("crypto");
  return {
    ...actual,
    default: actual,
  };
});

import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/security/rate-limit";

describe("POST /api/razorpay/verify-payment", () => {
  let mockSupabase: any;
  let mockAdmin: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up required environment variables
    process.env.RAZORPAY_KEY_SECRET = "test_secret_key";
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = "test_key_id";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test_anon_key";

    // Setup default mocks
    mockSupabase = {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(),
          })),
        })),
      })),
    };

    mockAdmin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(),
            })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(),
        })),
      })),
      rpc: vi.fn(),
    };

    vi.mocked(createClient).mockReturnValue(mockSupabase as any);
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin as any);
  });

  it("should return 401 when no access token provided", async () => {
    const request = new NextRequest("http://localhost:3000/api/razorpay/verify-payment", {
      method: "POST",
      body: JSON.stringify({
        razorpay_order_id: "order_123",
        razorpay_payment_id: "pay_123",
        razorpay_signature: "signature_123",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Authentication required");
  });

  it("should return 400 when razorpay_order_id is missing", async () => {
    const request = new NextRequest("http://localhost:3000/api/razorpay/verify-payment", {
      method: "POST",
      body: JSON.stringify({
        razorpay_payment_id: "pay_123",
        razorpay_signature: "signature_123",
        accessToken: "test-token",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing payment details");
  });

  it("should return 400 when razorpay_payment_id is missing", async () => {
    const request = new NextRequest("http://localhost:3000/api/razorpay/verify-payment", {
      method: "POST",
      body: JSON.stringify({
        razorpay_order_id: "order_123",
        razorpay_signature: "signature_123",
        accessToken: "test-token",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing payment details");
  });

  it("should return 400 when razorpay_signature is missing", async () => {
    const request = new NextRequest("http://localhost:3000/api/razorpay/verify-payment", {
      method: "POST",
      body: JSON.stringify({
        razorpay_order_id: "order_123",
        razorpay_payment_id: "pay_123",
        accessToken: "test-token",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing payment details");
  });

  it("should return 401 when user is not authenticated", async () => {
    // Mock Razorpay API responses
    mockPaymentsFetch.mockResolvedValue({
      order_id: "order_123",
      amount: 10000,
      currency: "INR",
      status: "captured",
    });
    mockOrdersFetch.mockResolvedValue({
      id: "order_123",
      amount: 10000,
      currency: "INR",
    });

    // Mock no user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    // Create a valid signature to pass the initial checks
    const crypto = await import("crypto");
    const signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update("order_123|pay_123")
      .digest("hex");

    const request = new NextRequest("http://localhost:3000/api/razorpay/verify-payment", {
      method: "POST",
      body: JSON.stringify({
        razorpay_order_id: "order_123",
        razorpay_payment_id: "pay_123",
        razorpay_signature: signature,
        accessToken: "test-token",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 429 when rate limited", async () => {
    // Mock Razorpay API responses
    mockPaymentsFetch.mockResolvedValue({
      order_id: "order_123",
      amount: 10000,
      currency: "INR",
      status: "captured",
    });
    mockOrdersFetch.mockResolvedValue({
      id: "order_123",
      amount: 10000,
      currency: "INR",
    });

    // Mock authenticated user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "test-user-id", email: "test@example.com" } },
    });

    // Mock rate limit as exceeded
    vi.mocked(consumeRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      retry_after: 30,
    });

    // Create a valid signature to pass the initial checks
    const crypto = await import("crypto");
    const signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update("order_123|pay_123")
      .digest("hex");

    const request = new NextRequest("http://localhost:3000/api/razorpay/verify-payment", {
      method: "POST",
      body: JSON.stringify({
        razorpay_order_id: "order_123",
        razorpay_payment_id: "pay_123",
        razorpay_signature: signature,
        accessToken: "test-token",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toBe("Too many payment attempts");
    expect(response.headers.get("Retry-After")).toBe("30");
  });
});
