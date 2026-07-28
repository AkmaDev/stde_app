"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Carte" },
  { href: "/indicateurs", label: "Indicateurs globaux" },
  { href: "/comparateur", label: "Comparateur de leviers" },
];

export default function TopTabs() {
  const pathname = usePathname();
  return (
    <div className="tabs">
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} className={`tab${pathname === tab.href ? " on" : ""}`}>
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
