"use client";

import { useState } from "react";
import { WhatsAppLog } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, CheckCircle, XCircle, Copy, Check, ExternalLink, Info } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

interface WhatsAppDashboardProps {
  logs: WhatsAppLog[];
  webhookUrl: string;
}

export function WhatsAppDashboard({ logs, webhookUrl }: WhatsAppDashboardProps) {
  const [copied, setCopied] = useState(false);

  function copyUrl() {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const successCount = logs.filter((l) => l.success).length;

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-green-600" />
          WhatsApp Sprachbefehle
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Touren per Sprachnachricht anlegen und verwalten
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Setup Card */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="w-5 h-5 text-blue-600" />
                Einrichtung — Twilio Sandbox
              </CardTitle>
              <CardDescription>
                Folge diesen Schritten, um WhatsApp Sprachbefehle zu aktivieren
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex gap-4">
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">1</div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">Twilio Account erstellen</p>
                  <p className="text-gray-500 text-sm mt-0.5">
                    Gehe zu{" "}
                    <a href="https://twilio.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline inline-flex items-center gap-1">
                      twilio.com <ExternalLink className="w-3 h-3" />
                    </a>{" "}
                    → Kostenloses Konto erstellen. Keine Kreditkarte nötig für Sandbox.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">2</div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">WhatsApp Sandbox aktivieren</p>
                  <p className="text-gray-500 text-sm mt-0.5">
                    Im Twilio Dashboard: <strong>Messaging → Try it out → Send a WhatsApp message</strong>.
                    Du bekommst eine Nummer und einen Join-Code. Schicke den Code von deiner WhatsApp-Nummer.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">3</div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">Webhook URL eintragen</p>
                  <p className="text-gray-500 text-sm mt-0.5 mb-2">
                    In der Sandbox-Konfiguration bei "When a message comes in" diese URL eintragen:
                  </p>
                  <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                    <code className="text-xs text-gray-800 flex-1 break-all">{webhookUrl}</code>
                    <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={copyUrl}>
                      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">4</div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">Umgebungsvariablen setzen</p>
                  <p className="text-gray-500 text-sm mt-0.5">
                    In Vercel / .env.local folgende Werte aus dem Twilio Dashboard eintragen:
                  </p>
                  <div className="mt-2 bg-gray-900 rounded-lg p-3 font-mono text-xs text-green-400 space-y-1">
                    <div>TWILIO_ACCOUNT_SID=ACxxxx...</div>
                    <div>TWILIO_AUTH_TOKEN=xxxx...</div>
                    <div>TWILIO_WHATSAPP_FROM=+14155238886</div>
                    <div>OPENAI_API_KEY=sk-xxx...</div>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mt-4">
                <p className="text-green-800 text-sm font-medium mb-2">✅ Sprachbefehl Beispiele</p>
                <div className="space-y-1.5">
                  {[
                    '"Fahrer Müller mit Kennzeichen HH-XY 123 fährt morgen zu Kunde ABC GmbH"',
                    '"Schmidt fährt übermorgen zu Müller Logistik, Fahrzeug HB-AB 456"',
                    '"Bitte lege eine Tour an für heute: Fahrer Weber, Kunde Bauer AG"',
                  ].map((ex) => (
                    <p key={ex} className="text-green-700 text-xs italic">{ex}</p>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-4xl font-bold text-gray-900">{logs.length}</p>
                <p className="text-sm text-gray-500 mt-1">Befehle gesamt</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-4xl font-bold text-green-600">{successCount}</p>
                <p className="text-sm text-gray-500 mt-1">Erfolgreich ausgeführt</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-4xl font-bold text-red-500">{logs.length - successCount}</p>
                <p className="text-sm text-gray-500 mt-1">Fehlgeschlagen</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Log Table */}
      <Card>
        <CardHeader>
          <CardTitle>Befehlsprotokoll</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Zeit</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Transkription</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Aktion</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-gray-400">
                      <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Noch keine Befehle empfangen</p>
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const parsed = log.parsed_action as any;
                    return (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-xs text-gray-500 whitespace-nowrap">
                          {formatDateTime(log.created_at)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-800 max-w-xs">
                          <p className="truncate italic">"{log.transcript}"</p>
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-600">
                          {parsed?.action === "create_tour" && (
                            <span className="font-medium">Tour anlegen · {parsed.tour_date}</span>
                          )}
                          {parsed?.action === "unknown" && <span className="text-gray-400">Nicht erkannt</span>}
                          {!parsed && <span className="text-gray-400">–</span>}
                        </td>
                        <td className="px-6 py-4">
                          {log.success ? (
                            <div className="flex items-center gap-1.5 text-green-600 text-xs font-medium">
                              <CheckCircle className="w-4 h-4" /> Erfolg
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-red-500 text-xs font-medium">
                              <XCircle className="w-4 h-4" /> Fehler
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
