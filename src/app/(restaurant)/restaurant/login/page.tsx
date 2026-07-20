"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/supabase/types";
import toast from "react-hot-toast";

export default function RestaurantLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      const message = "Please enter email and password";
      setError(message);
      toast.error(message);
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;
      if (!data.user) throw new Error("No user returned");

      // Check profile role
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();

      if (profileError) throw profileError;

      const typedProfile = profile as Profile;
      if (
        !typedProfile ||
        !["outlet_staff", "admin", "super_admin"].includes(typedProfile.role)
      ) {
        await supabase.auth.signOut();
        const message = "You do not have access to the restaurant panel.";
        setError(message);
        toast.error(message);
        setLoading(false);
        return;
      }

      let outlets: { id: string }[] = [];
      if (["admin", "super_admin"].includes(typedProfile.role)) {
        const { data: outletsData } = await supabase
          .from("outlets")
          .select("id")
          .eq("is_active", true);
        outlets = (outletsData as { id: string }[] | null) ?? [];
      } else {
        const { data: assignments } = await supabase
          .from("outlet_staff" as never)
          .select("outlet_id")
          .eq("user_id" as never, data.user.id as never);
        const outletIds = ((assignments as { outlet_id: string }[] | null) ?? [])
          .map((assignment) => assignment.outlet_id);
        if (outletIds.length > 0) {
          const { data: outletsData } = await supabase
            .from("outlets")
            .select("id")
            .in("id", outletIds)
            .eq("is_active", true);
          outlets = (outletsData as { id: string }[] | null) ?? [];
        }
      }

      if (outlets.length > 0) {
        localStorage.setItem("pnut_selected_outlet", outlets[0].id);
      }

      toast.success("Logged in successfully.");
      router.push("/restaurant");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      toast.error(message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-brand-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Image
            src="/logo.webp"
            alt="PNUT MONSTER"
            width={96}
            height={96}
            priority
            className="mx-auto mb-2 object-contain"
          />
          <h1 className="font-heading text-xl font-bold text-brand-black">
            Restaurant Panel
          </h1>
          <p className="text-sm text-brand-gray-500 mt-1">
            Sign in to manage your outlet
          </p>
        </div>

        {/* Login form */}
        <div className="bg-white rounded-2xl shadow-sm border border-brand-gray-200 p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-brand-gray-700 mb-1.5"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@pnutmonster.com"
                className="w-full px-4 py-2.5 rounded-xl border border-brand-gray-300 text-sm text-brand-black placeholder:text-brand-gray-400 focus:outline-none focus:border-brand-green focus:ring-1 focus:ring-brand-green transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-brand-gray-700 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-2.5 pr-10 rounded-xl border border-brand-gray-300 text-sm text-brand-black placeholder:text-brand-gray-400 focus:outline-none focus:border-brand-green focus:ring-1 focus:ring-brand-green transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-gray-400 hover:text-brand-gray-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                <p className="text-sm text-brand-red font-medium">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-brand-green text-white font-semibold text-sm hover:bg-brand-green-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

        </div>

        {/* Footer */}
        <p className="text-center text-xs text-brand-gray-400 mt-6">
          PNUT MONSTER &mdash; Restaurant Management
        </p>
      </div>
    </div>
  );
}
