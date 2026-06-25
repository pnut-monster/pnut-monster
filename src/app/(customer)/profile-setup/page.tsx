"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Camera, ArrowRight, Loader2, Phone, CheckSquare, Square } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

export default function ProfileSetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [fullName, setFullName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [agreedTnc, setAgreedTnc] = useState(false);

  useEffect(() => {
    const prefill = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setAuthEmail(user.email ?? "");
        const metaName = user.user_metadata?.full_name ?? "";
        if (metaName) setFullName(metaName);
      }
    };
    prefill();
  }, []);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be less than 2MB");
      return;
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim()) { toast.error("Please enter your name"); return; }
    if (!agreedTnc) { toast.error("Please agree to the Terms & Privacy Policy"); return; }

    // Validate phone if entered
    const cleanedPhone = phone.replace(/\D/g, "");
    if (phone && cleanedPhone.length !== 10) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        toast.error("Session expired. Please log in again.");
        router.replace("/login");
        return;
      }

      let avatarUrl: string | null = null;

      if (avatarFile) {
        const ext = avatarFile.name.split(".").pop();
        const path = `avatars/${user.id}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, avatarFile, { upsert: true });

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
          avatarUrl = publicUrl;
        }
      }

      // First check if profile exists
      const { data: existingProfile, error: fetchError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .single();

      console.log("Existing profile check:", { existingProfile, fetchError, userId: user.id });

      const { error } = await supabase.from("profiles")
        .update({
          full_name: fullName.trim(),
          email: authEmail || null,
          phone: cleanedPhone ? `+91${cleanedPhone}` : null,
          date_of_birth: dob || null,
          avatar_url: avatarUrl,
        })
        .eq('id', user.id);

      if (error) {
        console.error("Profile save error:", error);
        console.error("Error details:", JSON.stringify(error, null, 2));
        toast.error(`Failed to save profile: ${error.message}`);
        return;
      }

      toast.success("Profile created! Welcome aboard!");
      router.replace("/");
    } catch (err) {
      console.error("Profile setup error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#FAFBFC]">
      <div className="max-w-lg mx-auto px-6 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <img src="/logo.webp" alt="PNUT MONSTER" className="w-20 h-20 mx-auto mb-3 object-contain" />
          <h1 className="font-heading text-2xl font-bold text-brand-black">
            Complete your profile
          </h1>
          <p className="text-brand-gray-500 text-sm mt-1">
            Just a few details and you&apos;re all set
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5" suppressHydrationWarning>
          {/* Avatar */}
          <div className="flex justify-center">
            <label className="relative cursor-pointer group">
              <div className="w-24 h-24 rounded-full bg-brand-gray-100 border-2 border-dashed border-brand-gray-300 flex items-center justify-center overflow-hidden group-hover:border-brand-yellow transition-colors">
                {avatarPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarPreview} alt="Avatar preview" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-8 h-8 text-brand-gray-400" />
                )}
              </div>
              <div className="absolute bottom-0 right-0 w-8 h-8 bg-brand-yellow rounded-full flex items-center justify-center shadow-md">
                <Camera className="w-4 h-4 text-brand-black" />
              </div>
              <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
            </label>
          </div>

          {/* Full Name */}
          <div>
            <label htmlFor="fullName" className="block text-sm font-semibold text-brand-gray-700 mb-1.5">
              Full Name <span className="text-brand-red">*</span>
            </label>
            <input
              id="fullName"
              type="text"
              placeholder="Enter your full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-3 bg-white border-2 border-brand-gray-200 rounded-xl text-sm outline-none focus:border-brand-yellow transition-colors placeholder:text-brand-gray-400"
            />
          </div>

          {/* Email (read-only) */}
          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-brand-gray-700 mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={authEmail}
              readOnly
              className="w-full px-4 py-3 bg-brand-gray-50 border-2 border-brand-gray-200 rounded-xl text-sm outline-none text-brand-gray-500 cursor-not-allowed"
            />
          </div>

          {/* Mobile Number */}
          <div>
            <label htmlFor="phone" className="block text-sm font-semibold text-brand-gray-700 mb-1.5">
              Mobile Number{" "}
              <span className="text-brand-gray-400 font-normal">(optional)</span>
            </label>
            <div className="flex items-center border-2 border-brand-gray-200 rounded-xl focus-within:border-brand-yellow transition-colors bg-white" suppressHydrationWarning>
              <div className="flex items-center gap-1.5 pl-3 pr-2 border-r border-brand-gray-200">
                <Phone className="w-4 h-4 text-brand-gray-400" />
                <span className="text-sm font-semibold text-brand-gray-600">+91</span>
              </div>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="10-digit mobile number"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="flex-1 px-3 py-3 text-sm bg-transparent outline-none placeholder:text-brand-gray-400"
              />
            </div>
          </div>

          {/* Date of Birth */}
          <div>
            <label htmlFor="dob" className="block text-sm font-semibold text-brand-gray-700 mb-1.5">
              Date of Birth{" "}
              <span className="text-brand-gray-400 font-normal">(for birthday surprises!)</span>
            </label>
            <input
              id="dob"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="w-full px-4 py-3 bg-white border-2 border-brand-gray-200 rounded-xl text-sm outline-none focus:border-brand-yellow transition-colors text-brand-gray-700"
            />
          </div>

          {/* T&C and Privacy Policy */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setAgreedTnc(!agreedTnc)}
              className="flex items-start gap-3 text-left w-full"
            >
              {agreedTnc ? (
                <CheckSquare className="w-5 h-5 text-brand-yellow-dark flex-shrink-0 mt-0.5" />
              ) : (
                <Square className="w-5 h-5 text-brand-gray-400 flex-shrink-0 mt-0.5" />
              )}
              <span className="text-xs text-brand-gray-500 leading-relaxed">
                I agree to the{" "}
                <span className="font-semibold text-brand-black underline">Terms & Conditions</span>{" "}
                and{" "}
                <span className="font-semibold text-brand-black underline">Privacy Policy</span>{" "}
                of PNUT MONSTER. I consent to the collection and use of my personal data as described.
              </span>
            </button>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !fullName.trim() || !agreedTnc}
            className="w-full flex items-center justify-center gap-2 bg-brand-yellow text-brand-black font-bold py-3.5 rounded-xl text-sm hover:bg-brand-yellow-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Get Started
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <p className="text-center text-[10px] text-brand-gray-400 mt-2">
            Your data is securely stored and will never be shared without your consent.
          </p>
        </form>
      </div>
    </div>
  );
}
