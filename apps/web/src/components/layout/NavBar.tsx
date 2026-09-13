import Link from "next/link";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/insights", label: "Insights" },
  { href: "/validation", label: "Validation" },
  { href: "/break", label: "Break" },
];

export function NavBar() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight text-ink">
          Flow
        </Link>
        <nav className="flex gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-accent-soft hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
