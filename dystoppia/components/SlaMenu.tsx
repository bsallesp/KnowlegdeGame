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
      className="sticky top-0 z-50 border-b border-white/10 bg-[#09090E]/88 backdrop-blur-xl"
      data-testid="sla-menu"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <Link href="/" className="flex items-center gap-3 self-start rounded-2xl px-1 py-1 transition hover:opacity-90">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-400/12 text-xs font-semibold tracking-[0.24em] text-cyan-100"
            aria-hidden="true"
          >
            SLA
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-white/45">System Menu</p>
            <p className="text-sm font-semibold text-white">Dystoppia</p>
          </div>
        </Link>

        <nav aria-label="Primary" className="flex flex-wrap items-center gap-2">
          {navItems.map((item) => {
            const active = isActive(pathname, item.matchers);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="rounded-2xl px-4 py-2 text-sm font-medium transition"
                style={{
                  backgroundColor: active ? "rgba(129,140,248,0.16)" : "rgba(255,255,255,0.04)",
                  border: active ? "1px solid rgba(129,140,248,0.34)" : "1px solid rgba(255,255,255,0.08)",
                  color: active ? "#EEEEFF" : "#B4B4CC",
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
