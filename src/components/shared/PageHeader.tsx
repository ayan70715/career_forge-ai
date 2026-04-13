"use client";

import { motion } from "framer-motion";
import { type LucideIcon } from "lucide-react";

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  gradient?: string;
}

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  gradient = "from-primary to-violet-400",
}: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative mb-10 py-6"
    >
      {/* Spotlight glow behind icon */}
      <div
        className="absolute top-2 left-5 w-32 h-32 pointer-events-none opacity-40"
        style={{
          background: "radial-gradient(circle, rgba(139,92,246,0.2), transparent 70%)",
        }}
      />
      <div className="relative flex items-center gap-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br ${gradient} shadow-[0_0_20px_rgba(139,92,246,0.25)]`}
        >
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            <span className="bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
              {title}
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </div>
      </div>
      {/* Bottom separator line with glow */}
      <div className="mt-6 h-px bg-linear-to-r from-primary/20 via-glass-border to-transparent" />
    </motion.div>
  );
}
