"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  FileText,
  Sparkles,
  ScanSearch,
  ShieldCheck,
  Mail,
  Mic,
  ArrowRight,
  Zap,
  Cpu,
  BarChart3,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BentoGrid } from "@/components/home/BentoGrid";
import { BentoCard } from "@/components/home/BentoCard";
import {
  ResumePreview,
  EnhancePreview,
  ATSPreview,
  ResumeVerifierPreview,
  CVPreview,
  InterviewPreview,
} from "@/components/home/FeaturePreview";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      {/* ── Hero ── */}
      <section className="relative pt-16 pb-20 text-center">
        {/* Radial glow orb */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] pointer-events-none opacity-40"
          style={{
            background: "radial-gradient(ellipse, rgba(139,92,246,0.15), transparent 70%)",
          }}
        />

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          transition={{ duration: 0.6 }}
          className="relative z-10"
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm text-primary mb-8 backdrop-blur-sm">
            <Zap className="h-3.5 w-3.5" />
            AI-Powered Career Toolkit
          </div>

          <h1 className="text-5xl font-bold tracking-tight mb-5 sm:text-6xl lg:text-7xl">
            <span className="bg-linear-to-b from-white via-foreground to-muted-foreground bg-clip-text text-transparent">
              Build your career
            </span>
            <br />
            <span className="bg-linear-to-r from-primary via-violet-400 to-purple-300 bg-clip-text text-transparent">
              with AI precision
            </span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Generate stunning resumes, ace interviews, and optimize for ATS — all powered by advanced AI.
            Your complete career toolkit in one place.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 justify-center">
            <Button asChild variant="glow" size="lg" className="gap-2 text-base">
              <Link href="/resume-builder">
                Start Building <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-base">
              <Link href="/settings">Configure API Key</Link>
            </Button>
          </div>
        </motion.div>
      </section>

      {/* ── Bento Grid ── */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        transition={{ staggerChildren: 0.08 }}
        className="pb-20"
      >
        <BentoGrid className="lg:grid-rows-3">
          {/* Resume Builder — large 2-col card */}
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }} className="sm:col-span-2 lg:row-span-2">
            <BentoCard href="/resume-builder" className="h-full">
              <div className="p-6 h-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-linear-to-br from-violet-500 to-purple-600 shadow-[0_0_20px_rgba(139,92,246,0.3)]">
                      <FileText className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                        Resume Builder
                      </h3>
                      <p className="text-xs text-muted-foreground">LaTeX-powered professional resumes</p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
                    Most Popular
                  </span>
                </div>
                <div className="flex-1 mt-2">
                  <ResumePreview />
                </div>
                <div className="mt-4 flex items-center gap-1 text-sm text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Build your resume <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </div>
            </BentoCard>
          </motion.div>

          {/* AI Enhance */}
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }}>
            <BentoCard href="/ai-enhance" className="h-full">
              <div className="p-5 h-full flex flex-col">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-linear-to-br from-amber-500 to-orange-600 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-amber-400 transition-colors">
                    AI Enhance
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Multi-level AI improvements from basic grammar to complete rewrites
                </p>
                <div className="flex-1">
                  <EnhancePreview />
                </div>
              </div>
            </BentoCard>
          </motion.div>

          {/* ATS Checker */}
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }}>
            <BentoCard href="/ats-checker" className="h-full">
              <div className="p-5 h-full flex flex-col items-center text-center">
                <div className="flex items-center gap-3 mb-3 self-start">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-linear-to-br from-emerald-500 to-teal-600 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                    <ScanSearch className="h-4 w-4 text-white" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-emerald-400 transition-colors">
                    ATS Checker
                  </h3>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <ATSPreview />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Score and optimize for ATS systems
                </p>
              </div>
            </BentoCard>
          </motion.div>

          {/* Resume Verifier */}
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }}>
            <BentoCard href="/resume-verifier" className="h-full">
              <div className="p-5 h-full flex flex-col">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-linear-to-br from-indigo-500 to-sky-600 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                    <ShieldCheck className="h-4 w-4 text-white" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-indigo-400 transition-colors">
                    Resume Verifier
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Adaptive interview-style checks for resume claims
                </p>
                <div className="flex-1">
                  <ResumeVerifierPreview />
                </div>
              </div>
            </BentoCard>
          </motion.div>

          {/* CV Generator */}
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }}>
            <BentoCard href="/cv-generator" className="h-full">
              <div className="p-5 h-full flex flex-col">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-linear-to-br from-cyan-500 to-blue-600 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                    <Mail className="h-4 w-4 text-white" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-cyan-400 transition-colors">
                    CV / Cover Letter
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Tailored cover letters & academic CVs
                </p>
                <div className="flex-1">
                  <CVPreview />
                </div>
              </div>
            </BentoCard>
          </motion.div>

          {/* Interview Prep */}
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }}>
            <BentoCard href="/interview-prep" className="h-full">
              <div className="p-5 h-full flex flex-col">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-linear-to-br from-rose-500 to-pink-600 shadow-[0_0_15px_rgba(244,63,94,0.2)]">
                    <Mic className="h-4 w-4 text-white" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-rose-400 transition-colors">
                    Interview Prep
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Live AI interview with voice interaction
                </p>
                <div className="flex-1">
                  <InterviewPreview />
                </div>
              </div>
            </BentoCard>
          </motion.div>

          {/* Stat card: AI Tools */}
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }}>
            <div className="h-full rounded-2xl border border-glass-border bg-glass-bg backdrop-blur-md p-5 flex flex-col items-center justify-center text-center">
              <Cpu className="h-8 w-8 text-primary mb-3 opacity-60" />
              <div className="text-3xl font-bold text-foreground mb-1">6</div>
              <div className="text-sm text-muted-foreground">AI-Powered Tools</div>
              <div className="text-xs text-muted-foreground mt-1">Gemini AI Engine</div>
            </div>
          </motion.div>
        </BentoGrid>
      </motion.section>

      {/* ── Stats bar ── */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={fadeUp}
        transition={{ duration: 0.5 }}
        className="pb-20"
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { icon: Zap, label: "Real-time", desc: "Instant generation" },
            { icon: Shield, label: "LaTeX Quality", desc: "Professional output" },
            { icon: BarChart3, label: "ATS Optimized", desc: "Beat the bots" },
            { icon: Cpu, label: "Gemini AI", desc: "Advanced engine" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-glass-border bg-glass-bg backdrop-blur-md p-4 text-center transition-all duration-300 hover:border-primary/20 hover:shadow-[0_0_20px_rgba(139,92,246,0.06)]"
            >
              <stat.icon className="h-5 w-5 text-primary mx-auto mb-2 opacity-70" />
              <div className="text-sm font-medium text-foreground">{stat.label}</div>
              <div className="text-xs text-muted-foreground">{stat.desc}</div>
            </div>
          ))}
        </div>
      </motion.section>

      {/* ── Bottom CTA ── */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={fadeUp}
        transition={{ duration: 0.5 }}
        className="pb-16"
      >
        <div className="relative overflow-hidden rounded-2xl border border-glass-border bg-glass-bg backdrop-blur-md p-10 text-center">
          {/* Glow accent */}
          <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[200px] pointer-events-none opacity-30"
            style={{
              background: "radial-gradient(ellipse, rgba(139,92,246,0.2), transparent 70%)",
            }}
          />
          <h2 className="relative text-2xl font-bold mb-3 sm:text-3xl">
            Ready to get started?
          </h2>
          <p className="relative text-muted-foreground mb-6 max-w-md mx-auto">
            Configure your API key and start building professional career materials with AI.
          </p>
          <div className="relative flex flex-col gap-3 sm:flex-row sm:gap-4 justify-center">
            <Button asChild variant="glow" size="lg" className="gap-2">
              <Link href="/resume-builder">
                Build Your Resume <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/settings">Add API Key</Link>
            </Button>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
