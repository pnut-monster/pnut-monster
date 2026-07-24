import { vi, describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/razorpay/wallet-topup/route";

// Mock modules
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
  walletTopupEmailData: vi.fn(),
}));

vi.mock("razorpay", () => {
  return {
    default: class MockRazorpay {
      orders = {
        create: vi.fn(),
      };
      payments = {
        fetch: vi.fn(),
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
import { consumeRateLimit } from "@/lib/security/rate-limit";

describe("POST /api/razorpay/wallet-topup", () => {
  let mockSupabase: any;

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
      rpc: vi.fn(),
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(),
          })),
        })),
      })),
    };

    vi.mocked(createClient).mockReturnValue(mockSupabase as any);
  });

  it("should return 401 when no access token", async () => {
    const request = new NextRequest("http://localhost:3000/api/razorpay/wallet-topup", {
      method: "POST",
      body: JSON.stringify({
        action: "create-order",
        amount: 100,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 401 when user is not authenticated", async () => {
    // Mock no user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    const request = new NextRequest("http://localhost:3000/api/razorpay/wallet-topup", {
      method: "POST",
      body: JSON.stringify({
        action: "create-order",
        amount: 100,
        accessToken: "test-token",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 400 for invalid action", async () => {
    // Mock authenticated user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "test-user-id", email: "test@example.com" } },
    });

    // Mock rate limit as allowed
    vi.mocked(consumeRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 19,
      retry_after: 0,
    });

    const request = new NextRequest("http://localhost:3000/api/razorpay/wallet-topup", {
      method: "POST",
      body: JSON.stringify({
        action: "invalid-action",
        amount: 100,
        accessToken: "test-token",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid action");
  });

  it("should return 400 for negative amount", async () => {
    // Mock authenticated user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "test-user-id", email: "test@example.com" } },
    });

    // Mock rate limit as allowed
    vi.mocked(consumeRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 19,
      retry_after: 0,
    });

    const request = new NextRequest("http://localhost:3000/api/razorpay/wallet-topup", {
      method: "POST",
      body: JSON.stringify({
        action: "create-order",
        amount: -100,
        accessToken: "test-token",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Minimum top-up is ₹1");
  });

  it("should return 400 for zero amount", async () => {
    // Mock authenticated user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "test-user-id", email: "test@example.com" } },
    });

    // Mock rate limit as allowed
    vi.mocked(consumeRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 19,
      retry_after: 0,
    });

    const request = new NextRequest("http://localhost:3000/api/razorpay/wallet-topup", {
      method: "POST",
      body: JSON.stringify({
        action: "create-order",
        amount: 0,
        accessToken: "test-token",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Minimum top-up is ₹1");
  });

  it("should return 400 when amount exceeds 100000", async () => {
    // Mock authenticated user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "test-user-id", email: "test@example.com" } },
    });

    // Mock rate limit as allowed
    vi.mocked(consumeRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 19,
      retry_after: 0,
    });

    const request = new NextRequest("http://localhost:3000/api/razorpay/wallet-topup", {
      method: "POST",
      body: JSON.stringify({
        action: "create-order",
        amount: 100001,
        accessToken: "test-token",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Minimum top-up is ₹1");
  });

  it("should return 429 when rate limited", async () => {
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

    const request = new NextRequest("http://localhost:3000/api/razorpay/wallet-topup", {
      method: "POST",
      body: JSON.stringify({
        action: "create-order",
        amount: 100,
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
