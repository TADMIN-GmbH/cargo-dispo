#!/usr/bin/env node
/**
 * Scaffold a new portal in one command:
 *   node scripts/new-portal.mjs <id> <label> <color> <icon>
 *
 * Example:
 *   node scripts/new-portal.mjs abrechnung Abrechnung green Receipt
 *
 * Colors: blue | red | green | amber
 * Icons:  any lucide-react icon name (PascalCase)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const [id, label, color, icon] = process.argv.slice(2);

if (!id || !label || !color || !icon) {
  console.error("Usage: node scripts/new-portal.mjs <id> <label> <color> <icon>");
  console.error("Example: node scripts/new-portal.mjs abrechnung Abrechnung green Receipt");
  process.exit(1);
}

const href = `/${id}`;
const routeGroup = `(${id})`;
const sidebarName = `Sidebar${id.charAt(0).toUpperCase() + id.slice(1)}`;

// ─── 1. Add to portals.ts ────────────────────────────────────────────────────
const portalsPath = join(root, "src/lib/portals.ts");
let portalsContent = readFileSync(portalsPath, "utf8");

// Add icon import
const importLine = `  ${icon},\n`;
portalsContent = portalsContent.replace(
  /^import \{([\s\S]*?)\} from "lucide-react";/m,
  (match, imports) => {
    if (imports.includes(icon)) return match;
    return match.replace(`} from "lucide-react";`, `  ${icon},\n} from "lucide-react";`);
  }
);

// Add portal entry before closing bracket
const newEntry = `  {
    id: "${id}",
    label: "${label}",
    href: "${href}",
    accentColor: "${color}",
    icon: ${icon},
  },`;
portalsContent = portalsContent.replace(
  /(\s*\/\/ Weitere Portale hier einfügen:[\s\S]*?)\];/,
  `$1\n${newEntry}\n];`
);

writeFileSync(portalsPath, portalsContent);
console.log(`✓ portals.ts updated`);

// ─── 2. Create route group ───────────────────────────────────────────────────
const appDir = join(root, "src/app", routeGroup, id);
mkdirSync(appDir, { recursive: true });

// layout.tsx
const layoutContent = `export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ${sidebarName} } from "@/components/layout/sidebar-${id}";
import { PortalProvider } from "@/lib/portal-context";

export default async function ${id.charAt(0).toUpperCase() + id.slice(1)}Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const userRole = (profile?.role ?? "employee") as "admin" | "employee";
  const userName = profile?.full_name ?? user.email ?? "Benutzer";

  return (
    <PortalProvider accentColor="${color}" portalId="${id}">
      <div className="flex h-full">
        <${sidebarName}
          userRole={userRole}
          userName={userName}
          userEmail={user.email ?? ""}
        />
        <div className="flex-1 ml-60 transition-all duration-300 min-h-screen flex flex-col">
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </PortalProvider>
  );
}
`;
writeFileSync(join(root, "src/app", routeGroup, "layout.tsx"), layoutContent);

// page.tsx (starter)
const pageContent = `export default function ${id.charAt(0).toUpperCase() + id.slice(1)}Page() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900">${label}</h1>
      <p className="text-gray-500 mt-1">Portal wird aufgebaut…</p>
    </div>
  );
}
`;
writeFileSync(join(appDir, "page.tsx"), pageContent);
console.log(`✓ Route group src/app/${routeGroup}/${id}/ created`);

// ─── 3. Create sidebar component ────────────────────────────────────────────
const sidebarContent = `"use client";

import { ${icon}, Settings, UserPlus } from "lucide-react";
import { SidebarShell } from "./sidebar-shell";
import { UserRole } from "@/lib/types";

const navItems = [
  { href: "/${id}", icon: ${icon}, label: "${label}" },
  // Weitere Nav-Items hier eintragen
];

const adminItems = [
  { href: "/team", icon: UserPlus, label: "Team verwalten" },
  { href: "/settings", icon: Settings, label: "Einstellungen" },
];

interface ${sidebarName}Props {
  userRole: UserRole;
  userName: string;
  userEmail: string;
}

export function ${sidebarName}({ userRole, userName, userEmail }: ${sidebarName}Props) {
  return (
    <SidebarShell
      portalId="${id}"
      accentColor="${color}"
      navItems={navItems}
      adminItems={adminItems}
      userRole={userRole}
      userName={userName}
      userEmail={userEmail}
    />
  );
}
`;
writeFileSync(join(root, "src/components/layout", `sidebar-${id}.tsx`), sidebarContent);
console.log(`✓ src/components/layout/sidebar-${id}.tsx created`);

console.log(`
✅ Portal "${label}" (${id}) erfolgreich erstellt!

Nächste Schritte:
  1. Nav-Items in src/components/layout/sidebar-${id}.tsx anpassen
  2. Seiten unter src/app/${routeGroup}/${id}/ bauen
  3. git add -A && git push
`);
