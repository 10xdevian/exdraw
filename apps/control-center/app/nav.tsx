"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/services", label: "Services" },
  { href: "/database", label: "Database" },
  { href: "/redis", label: "Redis" },
  { href: "/kafka", label: "Kafka" },
  { href: "/errors", label: "Errors" },
];

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-dot" />
        Excaldraw Eng
      </div>
      {LINKS.map(link => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href} className={`nav-link${active ? " active" : ""}`}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
