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
    <header
      className="sticky top-0 z-50 border-b backdrop-blur-xl"
      style={{ backgroundColor: "rgba(9, 9, 14, 0.9)", borderColor: "#2E2E40" }}
      data-testid="sla-menu"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <Link
          href="/"
          className="w-fit text-xl font-bold tracking-tight transition-colors"
          style={{ color: "#EEEEFF" }}
        >
          Dystoppia
        </Link>
        <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-2">
          {navItems.map((item) => {
            const active = isActive(pathname, item.matchers);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: active ? "rgba(129, 140, 248, 0.16)" : "transparent",
                  border: `1px solid ${active ? "rgba(129, 140, 248, 0.35)" : "transparent"}`,
                  color: active ? "#818CF8" : "#9494B8",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
