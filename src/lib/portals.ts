import {
  MapPin,
  Truck,
  type LucideIcon,
} from "lucide-react";

export interface Portal {
  id: string;
  label: string;
  href: string;         // root path of the portal
  accentColor: string;  // Tailwind color name (blue, red, green, …)
  icon: LucideIcon;
}

export const portals: Portal[] = [
  {
    id: "dispo",
    label: "Disposition",
    href: "/",
    accentColor: "blue",
    icon: MapPin,
  },
  {
    id: "fuhrpark",
    label: "Fuhrpark",
    href: "/fuhrpark",
    accentColor: "red",
    icon: Truck,
  },
  // Weitere Portale hier einfügen:
  // { id: "abrechnung", label: "Abrechnung", href: "/abrechnung", accentColor: "green", icon: Receipt },
];

// Tailwind safelist — diese Klassen müssen statisch vorkommen damit Purging sie nicht entfernt
// bg-blue-600  hover:bg-blue-700  text-blue-400  border-blue-500  bg-blue-600/20
// bg-red-600   hover:bg-red-700   text-red-400   border-red-500   bg-red-600/20
// bg-green-600 hover:bg-green-700 text-green-400 border-green-500 bg-green-600/20
