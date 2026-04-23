"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  matchers: string[];
}

const navItems: NavItem[] = [
  { href: "/game", label: "Game", matchers: ["/game", "/session"] },
  { href: "/books", label: "Books", matchers: ["/books"] },
  { href: "/profile", label: "Profile", matchers: ["/profile"] },
  { href: "/settings", label: "Settings", matchers: ["/settings"] },
];

function isActive(pathname: string, matchers: string[]): boolean {
  return matchers.some((matcher) => pathname === matcher || pathname.startsWith(`${matcher}/`));
}

export default function SlaMenu() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#09090E]/88 backdrop-blur-xl" data-testid="sla-menu">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <span className="text-xl font-bold text-white">Dystoppia</span>
      </div>
    </header>
  );
}
