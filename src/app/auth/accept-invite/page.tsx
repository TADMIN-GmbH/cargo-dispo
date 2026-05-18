"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Truck, CheckCircle, Loader2 } from "lucide-react";

export default function AcceptInvitePage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<"loading" | "form" | "done" | "error">("loading");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    // Supabase client automatically exchanges the invite token from the URL fragment/hash
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        setUserEmail(session.user.email ?? "");
        setStep("form");
      } else if (event === "INITIAL_SESSION" && session?.user) {
        // Already signed in from invite link
        setUserEmail(session.user.email ?? "");
        setStep("form");
      }
    });

    // Also check immediately in case session is already set
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserEmail(session.user.email ?? "");
        setStep("form");
      } else {
        // No session yet — might need a moment for token exchange
        setTimeout(() => {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
              setUserEmail(session.user.email ?? "");
              setStep("form");
            } else {
              setStep("error");
            }
          });
        }, 1500);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!fullName.trim()) {
      setError("Bitte gib deinen vollständigen Namen ein.");
      return;
    }
    if (password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }
    if (password !== password2) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }

    setSaving(true);

    // Set password and update user metadata
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { full_name: fullName.trim() },
    });

    if (updateError) {
      setError("Fehler beim Speichern: " + updateError.message);
      setSaving(false);
      return;
    }

    // Update profile in DB
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").upsert({
        id: user.id,
        full_name: fullName.trim(),
      });

      // Mark invite as accepted
      await supabase
        .from("invites")
        .update({ accepted: true })
        .eq("email", user.email ?? "");
    }

    setStep("done");
    setTimeout(() => router.push("/"), 2000);
  }

  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="text-center text-white">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-400" />
          <p className="text-gray-400">Einladung wird überprüft...</p>
        </div>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Link ungültig oder abgelaufen</h2>
          <p className="text-gray-500 text-sm mb-6">Bitte fordere eine neue Einladung beim Administrator an.</p>
          <Button onClick={() => router.push("/login")}>Zum Login</Button>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Account eingerichtet!</h2>
          <p className="text-gray-500 text-sm">Du wirst weitergeleitet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Truck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Cargo Köhler</h1>
          <p className="text-gray-400 text-sm mt-1">Account einrichten</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Willkommen!</h2>
          <p className="text-gray-500 text-sm mb-6">
            Richte deinen Account ein für <span className="font-medium text-gray-700">{userEmail}</span>
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="name">Vollständiger Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Max Mustermann"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Passwort wählen</Label>
              <Input
                id="password"
                type="password"
                placeholder="Mindestens 8 Zeichen"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password2">Passwort bestätigen</Label>
              <Input
                id="password2"
                type="password"
                placeholder="Passwort wiederholen"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={saving} size="lg">
              {saving ? "Wird gespeichert..." : "Account einrichten"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
