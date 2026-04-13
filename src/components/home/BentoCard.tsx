"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

interface BentoCardProps {
  href: string;
  className?: string;
  children: React.ReactNode;
}

export function BentoCard({ href, className, children }: BentoCardProps) {
  return (
    <Link href={href} className={cn("group relative block", className)}>
      <div className="relative h-full overflow-hidden rounded-2xl border border-glass-border bg-glass-bg backdrop-blur-md transition-all duration-500 hover:border-[rgba(139,92,246,0.25)] hover:shadow-[0_0_40px_rgba(139,92,246,0.1)]">
        {/* Gradient top border accent */}
        <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        {children}
      </div>
    </Link>
  );
}
