"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap, Settings, ArrowRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { featureItems } from "./Navbar";

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-80 border-r border-glass-border bg-nav-bg-heavy backdrop-blur-xl p-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 border-b border-glass-border p-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-[0_0_15px_rgba(139,92,246,0.3)]">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground">
            CareerForge
          </span>
        </div>

        {/* Home link */}
        <div className="px-3 pt-4 pb-2">
          <Link
            href="/"
            onClick={() => onOpenChange(false)}
            className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
              pathname === "/"
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-muted-foreground hover:bg-surface-3 hover:text-foreground border border-transparent"
            }`}
          >
            Home
          </Link>
        </div>

        {/* Features section */}
        <div className="px-3 pb-2">
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Features
          </div>
          <nav className="flex flex-col gap-0.5">
            {featureItems.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => onOpenChange(false)}
                  className={`group flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                    isActive
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:bg-surface-3 hover:text-foreground border border-transparent"
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-linear-to-br ${item.gradient} opacity-80`}
                  >
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {item.description}
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Divider */}
        <div className="mx-3 border-t border-glass-border" />

        {/* Settings */}
        <div className="px-3 pt-2">
          <Link
            href="/settings"
            onClick={() => onOpenChange(false)}
            className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
              pathname === "/settings"
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-muted-foreground hover:bg-surface-3 hover:text-foreground border border-transparent"
            }`}
          >
            <Settings className="h-5 w-5" />
            <span>Settings</span>
          </Link>
        </div>

        {/* Footer */}
        <div className="mt-auto border-t border-glass-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
