"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Users, Mail, Clock, Trash2, Crown, User } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { AppUser, Invite } from "@/lib/types";

interface TeamManagerProps {
  teamMembers: Pick<AppUser, "id" | "full_name" | "role" | "created_at">[];
  pendingInvites: Invite[];
  currentUserId: string;
}

export function TeamManager({ teamMembers, pendingInvites, currentUserId }: TeamManagerProps) {
  const supabase = createClient();
  const [invites, setInvites] = useState(pendingInvites);
  const [members, setMembers] = useState(teamMembers);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"employee" | "admin">("employee");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleInvite() {
    setSending(true);
    setError("");
    setSuccess("");

    // Call server-side API route (requires service role key — cannot be called from client)
    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });

    const json = await res.json();

    if (!res.ok) {
      setError(json.error ?? "Fehler beim Einladen. Bitte versuche es erneut.");
      setSending(false);
      return;
    }

    // Also store in invites table so it shows as "pending" in the UI
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: insertError } = await supabase.from("invites").insert({
      email: inviteEmail,
      invited_by: currentUserId,
      role: inviteRole,
      token,
      accepted: false,
      expires_at: expiresAt,
    });

    if (!insertError) {
      const { data: newInvite } = await supabase.from("invites").select("*").eq("token", token).single();
      if (newInvite) setInvites((prev) => [newInvite, ...prev]);
    }

    setSuccess(`Einladungs-E-Mail wurde an ${inviteEmail} gesendet.`);
    setInviteEmail("");
    setSending(false);
    setTimeout(() => setDialogOpen(false), 2000);
  }

  async function handleRevokeInvite(id: string) {
    await supabase.from("invites").delete().eq("id", id);
    setInvites((prev) => prev.filter((i) => i.id !== id));
  }

  async function handleDeleteMember(id: string) {
    if (!confirm("Benutzer wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.")) return;
    const res = await fetch(`/api/team/members/${id}`, { method: "DELETE" });
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } else {
      const json = await res.json();
      alert(json.error ?? "Fehler beim Löschen.");
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            Team verwalten
          </h1>
          <p className="text-gray-500 text-sm mt-1">Mitarbeiter einladen und Zugriffsrechte verwalten</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <UserPlus className="w-4 h-4" />
          Mitarbeiter einladen
        </Button>
      </div>

      {/* Team Members */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Aktive Benutzer ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Rolle</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Hinzugefügt</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {members.map((m) => (
                <tr key={m.id} className={m.id === currentUserId ? "bg-blue-50" : "hover:bg-gray-50"}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                        {m.role === "admin" ? (
                          <Crown className="w-4 h-4 text-yellow-600" />
                        ) : (
                          <User className="w-4 h-4 text-gray-600" />
                        )}
                      </div>
                      <span className="font-medium text-gray-900">
                        {m.full_name ?? <span className="text-gray-400 italic">Noch kein Name</span>}
                        {m.id === currentUserId && (
                          <span className="text-xs text-blue-600 ml-2">(Du)</span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={m.role === "admin" ? "default" : "secondary"}>
                      {m.role === "admin" ? "Administrator" : "Mitarbeiter"}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(m.created_at)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {m.id !== currentUserId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDeleteMember(m.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-yellow-600" />
              Offene Einladungen ({invites.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">E-Mail</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Rolle</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Läuft ab</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {invites.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-900">
                        <Mail className="w-4 h-4 text-gray-400" />
                        {inv.email}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={inv.role === "admin" ? "default" : "secondary"}>
                        {inv.role === "admin" ? "Administrator" : "Mitarbeiter"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatDate(inv.expires_at)}</td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleRevokeInvite(inv.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Invite Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mitarbeiter einladen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>E-Mail-Adresse</Label>
              <Input
                type="email"
                placeholder="name@beispiel.de"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rolle</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as typeof inviteRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Mitarbeiter (kein Einladen)</SelectItem>
                  <SelectItem value="admin">Administrator (voller Zugriff)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">Mitarbeiter haben alle Rechte außer andere Benutzer einzuladen.</p>
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
            {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">{success}</div>}

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
              <Button onClick={handleInvite} disabled={sending || !inviteEmail}>
                {sending ? "Einladen..." : "Einladen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
