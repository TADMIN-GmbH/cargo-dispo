"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, User, Lock, CheckCircle, MessageCircle, RefreshCw, Euro } from "lucide-react";

interface SettingsViewProps {
  profile: { id: string; full_name: string; role: string; whatsapp_phone?: string };
  email: string;
}

type SollResult = { success: boolean; updated?: number; skipped?: number; total?: number; error?: string } | null;

export function SettingsView({ profile, email }: SettingsViewProps) {
  const supabase = createClient();
  const [fullName, setFullName] = useState(profile.full_name);
  const [whatsappPhone, setWhatsappPhone] = useState(profile.whatsapp_phone ?? "");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwError, setPwError] = useState("");
  const [computingSoll, setComputingSoll] = useState(false);
  const [sollResult, setSollResult] = useState<SollResult>(null);

  async function handleSaveProfile() {
    setSaving(true);
    await supabase
      .from("profiles")
      .update({ full_name: fullName, whatsapp_phone: whatsappPhone || null })
      .eq("id", profile.id);
    setSaving(false);
    setProfileSuccess(true);
    setTimeout(() => setProfileSuccess(false), 3000);
  }

  async function handleChangePassword() {
    setPwError("");
    if (newPw !== confirmPw) {
      setPwError("Passwörter stimmen nicht überein.");
      return;
    }
    if (newPw.length < 8) {
      setPwError("Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setSavingPw(false);
    if (error) {
      setPwError("Fehler beim Ändern des Passworts.");
      return;
    }
    setPwSuccess(true);
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    setTimeout(() => setPwSuccess(false), 3000);
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="w-6 h-6 text-gray-600" />
          Einstellungen
        </h1>
      </div>

      {/* Profile */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Profil
          </CardTitle>
          <CardDescription>Dein Name wird im Portal angezeigt</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>E-Mail</Label>
            <Input value={email} disabled className="bg-gray-50 text-gray-500" />
          </div>
          <div className="space-y-1.5">
            <Label>Vollständiger Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5 text-green-600" />
              WhatsApp-Nummer (Admin-Befehle)
            </Label>
            <Input
              type="tel"
              placeholder="+4915128717591 oder 015128717591"
              value={whatsappPhone}
              onChange={(e) => setWhatsappPhone(e.target.value)}
            />
            <p className="text-xs text-gray-400">
              Nur Administratoren mit hinterlegter Nummer können WhatsApp-Befehle erteilen (Touren anlegen, kopieren usw.).
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleSaveProfile} disabled={saving}>
              {saving ? "Speichern..." : "Speichern"}
            </Button>
            {profileSuccess && (
              <div className="flex items-center gap-1.5 text-green-600 text-sm">
                <CheckCircle className="w-4 h-4" /> Gespeichert
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Passwort ändern
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Neues Passwort</Label>
            <Input
              type="password"
              placeholder="Mindestens 8 Zeichen"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Neues Passwort bestätigen</Label>
            <Input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
            />
          </div>
          {pwError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {pwError}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button onClick={handleChangePassword} disabled={savingPw || !newPw || !confirmPw}>
              {savingPw ? "Ändern..." : "Passwort ändern"}
            </Button>
            {pwSuccess && (
              <div className="flex items-center gap-1.5 text-green-600 text-sm">
                <CheckCircle className="w-4 h-4" /> Passwort geändert
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Soll-Berechnung */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Euro className="w-5 h-5" /> Soll-Berechnung Touren
          </CardTitle>
          <CardDescription>
            Berechnet den Soll-Tagessatz für alle Touren ab 01.01.2026 neu – anhand der hinterlegten Preismodelle und Dieselpreise.
            Nutzen nach Änderung eines Preismodells.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button
              onClick={async () => {
                setComputingSoll(true);
                setSollResult(null);
                try {
                  const res = await fetch("/api/tours/compute-soll", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ since: "2026-01-01" }),
                  });
                  const data = await res.json();
                  setSollResult(data);
                } catch {
                  setSollResult({ success: false, error: "Netzwerkfehler" });
                }
                setComputingSoll(false);
              }}
              disabled={computingSoll}
              variant="outline"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${computingSoll ? "animate-spin" : ""}`} />
              {computingSoll ? "Wird berechnet…" : "Soll neu berechnen"}
            </Button>
          </div>
          {sollResult && (
            <div className={`rounded-md p-3 text-sm ${sollResult.success ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {sollResult.success
                ? `✓ ${sollResult.updated} Touren aktualisiert, ${sollResult.skipped} ohne Preismodell (gesamt ${sollResult.total})`
                : `Fehler: ${sollResult.error}`}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
