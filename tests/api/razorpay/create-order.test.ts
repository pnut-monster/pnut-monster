import { vi, describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/razorpay/create-order/route";

// Mock modules
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  consumeRateLimit: vi.fn(),
  requestIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("razorpay", () => {
  return {
    default: class MockRazorpay {
      orders = {
        create: vi.fn(),
      };
    },
  };
});

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/security/rate-limit";

describe("POST /api/razorpay/create-order", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSupabase: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockAdmin: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up required environment variables
    process.env.RAZORPAY_KEY_SECRET = "test_secret_key";
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = "test_key_id";

    // Setup default mocks
    mockSupabase = {
      auth: {
        getUser: vi.fn(),
      },
    };

    mockAdmin = {
      rpc: vi.fn(),
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(),
          })),
        })),
      })),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin as any);
  });

  it("should return 401 when no auth session", async () => {
    // Mock no user session
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    const request = new NextRequest("http://localhost:3000/api/razorpay/create-order", {
      method: "POST",
      body: JSON.stringify({
        orderData: { total: 100 },
        orderItems: [{ name: "Test Item", quantity: 1, unit_price: 100 }],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 400 when orderData is missing", async () => {
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

    const request = new NextRequest("http://localhost:3000/api/razorpay/create-order", {
      method: "POST",
      body: JSON.stringify({
        orderItems: [{ name: "Test Item", quantity: 1, unit_price: 100 }],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing order details");
  });

  it("should return 400 when orderItems is empty", async () => {
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

    const request = new NextRequest("http://localhost:3000/api/razorpay/create-order", {
      method: "POST",
      body: JSON.stringify({
        orderData: { total: 100 },
        orderItems: [],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing order details");
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

    const request = new NextRequest("http://localhost:3000/api/razorpay/create-order", {
      method: "POST",
      body: JSON.stringify({
        orderData: { total: 100 },
        orderItems: [{ name: "Test Item", quantity: 1, unit_price: 100 }],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toBe("Too many payment attempts");
    expect(response.headers.get("Retry-After")).toBe("30");
  });

  it("should return 400 for unsupported currency", async () => {
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

    const request = new NextRequest("http://localhost:3000/api/razorpay/create-order", {
      method: "POST",
      body: JSON.stringify({
        currency: "USD",
        orderData: { total: 100 },
        orderItems: [{ name: "Test Item", quantity: 1, unit_price: 100 }],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Unsupported currency");
  });
});
