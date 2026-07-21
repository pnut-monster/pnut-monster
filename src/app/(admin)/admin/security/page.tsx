"use client";

import { useCallback, useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { Fingerprint, ShieldCheck, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button, Input } from "@/components/ui";

type Passkey = {
  id: string;
  name: string;
  device_type: string | null;
  backed_up: boolean;
  created_at: string;
  last_used_at: string | null;
};

export default function AdminSecurityPage() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [removing, setRemoving] = useState("");

  const loadPasskeys = useCallback(async () => {
    const response = await fetch("/api/admin/passkeys", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) {
      toast.error(body.error || "Could not load passkeys");
    } else {
      setPasskeys(body.passkeys as Passkey[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(loadPasskeys, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadPasskeys]);

  const addPasskey = async () => {
    if (!("PublicKeyCredential" in window)) {
      toast.error("This browser or device does not support passkeys");
      return;
    }
    const passkeyName = name.trim() || `Passkey · ${new Date().toLocaleDateString()}`;
    setRegistering(true);
    try {
      const optionsRes = await fetch("/api/admin/passkeys/register-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const optionsBody = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(optionsBody.error || "Could not start registration");
      const credential = await startRegistration({
        optionsJSON: optionsBody as PublicKeyCredentialCreationOptionsJSON,
      });
      const verifyRes = await fetch("/api/admin/passkeys/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: passkeyName, response: credential }),
      });
      const verifyBody = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyBody.error || "Passkey verification failed");
      toast.success("Passkey added");
      setName("");
      await loadPasskeys();
    } catch (error: unknown) {
      console.error("Passkey registration failed", error);
      toast.error(error instanceof Error ? error.message : "Passkey registration was cancelled");
    } finally {
      setRegistering(false);
    }
  };

  const removePasskey = async (passkey: Passkey) => {
    if (!window.confirm(`Remove “${passkey.name}”? This cannot be undone.`)) return;
    setRemoving(passkey.id);
    const response = await fetch("/api/admin/passkeys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: passkey.id }),
    });
    const body = await response.json();
    if (!response.ok) toast.error(body.error || "Could not remove passkey");
    else {
      toast.success("Passkey removed");
      await loadPasskeys();
    }
    setRemoving("");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-brand-yellow/15 p-3">
            <Fingerprint className="h-6 w-6 text-brand-yellow-dark" />
          </div>
          <div>
            <h2 className="font-heading text-xl font-bold">Admin passkeys</h2>
            <p className="mt-1 text-sm text-brand-gray-500">
              Sign in without a password using your fingerprint, face, device PIN,
              or security key. Your authenticator code remains required as the
              second factor.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              label="Passkey name"
              value={name}
              onChange={(event) => setName(event.target.value.slice(0, 64))}
              placeholder="Work laptop, iPhone, security key…"
              autoComplete="off"
            />
          </div>
          <Button type="button" loading={registering} onClick={addPasskey}>
            <Fingerprint className="h-5 w-5" />
            Add passkey
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-brand-green" />
          <div>
            <h2 className="font-heading text-xl font-bold">Registered passkeys</h2>
            <p className="text-sm text-brand-gray-500">Only keep devices you recognize.</p>
          </div>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-brand-gray-500">Loading…</p>
        ) : passkeys.length === 0 ? (
          <p className="mt-5 rounded-xl bg-brand-gray-50 p-4 text-sm text-brand-gray-600">
            No passkeys registered yet. Password login remains available.
          </p>
        ) : (
          <div className="mt-5 divide-y rounded-xl border">
            {passkeys.map((passkey) => (
              <div key={passkey.id} className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-brand-gray-50 p-2">
                  <Fingerprint className="h-5 w-5 text-brand-gray-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{passkey.name}</p>
                  <p className="text-xs text-brand-gray-500">
                    Added {new Date(passkey.created_at).toLocaleDateString()}
                    {passkey.last_used_at
                      ? ` · Last used ${new Date(passkey.last_used_at).toLocaleDateString()}`
                      : ""}
                    {passkey.backed_up ? " · Synced" : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  loading={removing === passkey.id}
                  onClick={() => removePasskey(passkey)}
                  aria-label={`Remove ${passkey.name}`}
                  className="text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
