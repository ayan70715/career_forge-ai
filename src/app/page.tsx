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
  FolderSearch,
  Radar,
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
  ProjectAnalysePreview,
  JobAnalysePreview,
} from "@/components/home/FeaturePreview";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">

      {/* ── Hero ── */}
      <section className="relative pt-20 pb-24 text-center">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[480px] pointer-events-none opacity-35"
          style={{
            background:
              "radial-gradient(ellipse at 50% 30%, rgba(139,92,246,0.18) 0%, rgba(99,102,241,0.08) 50%, transparent 70%)",
          }}
        />

        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="relative z-10"
        >
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm text-primary mb-8 backdrop-blur-sm">
              <Zap className="h-3.5 w-3.5" />
              AI-Powered Career Toolkit
            </div>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            transition={{ duration: 0.6 }}
            className="text-5xl font-bold tracking-tight mb-5 sm:text-6xl lg:text-7xl"
          >
            <span className="bg-linear-to-b from-white via-foreground to-muted-foreground bg-clip-text text-transparent">
              Build your career
            </span>
            <br />
            <span className="bg-linear-to-r from-primary via-violet-400 to-purple-300 bg-clip-text text-transparent">
              with AI precision
            </span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.6 }}
            className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            Generate stunning resumes, ace interviews, and optimize for ATS —
            all powered by advanced AI. Your complete career toolkit in one place.
          </motion.p>

          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5 }}
            className="flex flex-col gap-3 sm:flex-row sm:gap-4 justify-center"
          >
            <Button asChild variant="glow" size="lg" className="gap-2 text-base">
              <Link href="/resume-builder">
                Start Building <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-base">
              <Link href="/settings">Configure API Key</Link>
            </Button>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Bento Grid ──
        4-column layout:
        Row 1: Resume Builder (3/4) | CV Generator (1/4)           — same height
        Row 2: Resume Verifier (2/4) | Resume Enhancer (2/4)       — same height
        Row 3: Project Analyse (2/4) | Job Analyse (2/4)           — same height
        Row 4: Live Interview (3/4) | ATS Checker (1/4)            — same height
      */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer}
        className="pb-20"
      >
        {/* Using a 4-col grid. Each row is a flex row so heights match. */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">

          {/* ── Row 1 ── Resume Builder 3/4 + CV Generator 1/4 ── */}

          {/* Resume Builder — col-span-3 */}
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5 }}
            className="lg:col-span-3"
          >
            <BentoCard href="/resume-builder" className="h-full min-h-[260px]">
              <div className="p-6 h-full flex flex-col">
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-violet-500 to-purple-600 shadow-[0_0_24px_rgba(139,92,246,0.35)]">
                      <FileText className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                        Resume Builder
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        LaTeX-powered professional resumes
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20 shrink-0">
                    Most Popular
                  </span>
                </div>
                <div className="flex-1 min-h-0">
                  <ResumePreview />
                </div>
                <div className="mt-4 flex items-center gap-1 text-sm text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Build your resume <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </div>
            </BentoCard>
          </motion.div>

          {/* CV Generator — col-span-1 */}
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.07 }}
            className="lg:col-span-1"
          >
            <BentoCard href="/cv-generator" className="h-full min-h-[260px]">
              <div className="p-5 h-full flex flex-col">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-linear-to-br from-cyan-500 to-blue-600 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                    <Mail className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground group-hover:text-cyan-400 transition-colors">
                      CV Generator
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Tailored & academic</p>
                  </div>
                </div>
                <div className="flex-1 min-h-0">
                  <CVPreview />
                </div>
              </div>
            </BentoCard>
          </motion.div>

          {/* ── Row 2 ── Resume Verifier 2/4 + Resume Enhancer 2/4 ── */}

          {/* Resume Verifier — col-span-2 */}
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.07 }}
            className="lg:col-span-2"
          >
            <BentoCard href="/resume-verifier" className="h-full min-h-[220px]">
              <div className="p-5 h-full flex flex-col">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-linear-to-br from-indigo-500 to-sky-600 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                    <ShieldCheck className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground group-hover:text-indigo-400 transition-colors">
                      Resume Verifier
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Claim verification</p>
                  </div>
                </div>
                <div className="flex-1 min-h-0">
                  <ResumeVerifierPreview />
                </div>
              </div>
            </BentoCard>
          </motion.div>

          {/* Resume Enhancer — col-span-2 */}
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.14 }}
            className="lg:col-span-2"
          >
            <BentoCard href="/ai-enhance" className="h-full min-h-[220px]">
              <div className="p-5 h-full flex flex-col">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-amber-500 to-orange-600 shadow-[0_0_18px_rgba(245,158,11,0.25)]">
                    <Sparkles className="h-4.5 w-4.5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground group-hover:text-amber-400 transition-colors">
                      Resume Enhancer
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Multi-level AI rewrites
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                  From grammar fixes to complete rewrites — powered by contextual AI.
                </p>
                <div className="flex-1 min-h-0">
                  <EnhancePreview />
                </div>
              </div>
            </BentoCard>
          </motion.div>

          {/* ── Row 3 ── Project Analyse 2/4 + Job Analyse 2/4 ── */}

          {/* Project Analyse — col-span-2 */}
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.07 }}
            className="lg:col-span-2"
          >
            <BentoCard href="/project-analyse" className="h-full min-h-[240px]">
              <div className="p-5 h-full flex flex-col">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-linear-to-br from-fuchsia-500 to-indigo-600 shadow-[0_0_15px_rgba(217,70,239,0.2)]">
                    <FolderSearch className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground group-hover:text-fuchsia-400 transition-colors">
                      Project Analyse
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Strength & uniqueness</p>
                  </div>
                </div>
                <div className="flex-1 min-h-0">
                  <ProjectAnalysePreview />
                </div>
              </div>
            </BentoCard>
          </motion.div>

          {/* Job Analyse — col-span-2 */}
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.14 }}
            className="lg:col-span-2"
          >
            <BentoCard href="/job-analyse" className="h-full min-h-[240px]">
              <div className="p-5 h-full flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-blue-600 to-indigo-700 shadow-[0_0_20px_rgba(37,99,235,0.3)]">
                      <Radar className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground group-hover:text-blue-400 transition-colors">
                        Job Analyse
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Real-time market insights
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 shrink-0">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
                    </span>
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">India Live</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                  Real-time salary benchmarking and skill-gap analysis for the Indian tech ecosystem.
                </p>
                <div className="flex-1 bg-surface-1 rounded-xl p-3 border border-glass-border relative overflow-hidden group-hover:border-blue-500/20 transition-colors min-h-0">
                  <JobAnalysePreview />
                </div>
              </div>
            </BentoCard>
          </motion.div>

          {/* ── Row 4 ── Live Interview 3/4 + ATS Checker 1/4 ── */}

          {/* Live Interview — col-span-3 */}
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.07 }}
            className="lg:col-span-3"
          >
            <BentoCard href="/interview-prep" className="h-full min-h-[240px]">
              <div className="p-5 h-full flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-linear-to-br from-rose-500 to-pink-600 shadow-[0_0_15px_rgba(244,63,94,0.2)]">
                    <Mic className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground group-hover:text-rose-400 transition-colors">
                      Live Interview
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Live AI voice sessions</p>
                  </div>
                </div>
                <div className="flex-1 min-h-0">
                  <InterviewPreview />
                </div>
              </div>
            </BentoCard>
          </motion.div>

          {/* ATS Checker — col-span-1 */}
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.14 }}
            className="lg:col-span-1"
          >
            <BentoCard href="/ats-checker" className="h-full min-h-[240px]">
              <div className="p-5 h-full flex flex-col">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-linear-to-br from-emerald-500 to-teal-600 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                    <ScanSearch className="h-4 w-4 text-white" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-emerald-400 transition-colors">
                    ATS Checker
                  </h3>
                </div>
                <div className="flex-1 flex items-center justify-center min-h-0">
                  <ATSPreview />
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Score and optimize for ATS systems
                </p>
              </div>
            </BentoCard>
          </motion.div>

          {/* ── Row 5 ── 8 AI Tools stat card — centred ── */}
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.07 }}
            className="lg:col-span-4 flex justify-center"
          >
            <div className="w-full max-w-xs min-h-[160px] rounded-2xl border border-glass-border bg-glass-bg backdrop-blur-md p-5 flex flex-col items-center justify-center text-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl" />
                <Cpu className="relative h-9 w-9 text-primary opacity-70" />
              </div>
              <div>
                <div className="text-4xl font-bold text-foreground tabular-nums">8</div>
                <div className="text-sm text-muted-foreground mt-1">AI-Powered Tools</div>
                <div className="text-xs text-muted-foreground/60 mt-0.5">Gemini AI Engine</div>
              </div>
              <div className="flex gap-1.5 mt-1">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-1 w-1 rounded-full bg-primary/40"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  />
                ))}
              </div>
            </div>
          </motion.div>

        </div>
      </motion.section>

      {/* ── Stats bar ── */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={staggerContainer}
        className="pb-20"
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { icon: Zap, label: "Real-time", desc: "Instant generation", color: "text-yellow-400" },
            { icon: Shield, label: "LaTeX Quality", desc: "Professional output", color: "text-violet-400" },
            { icon: BarChart3, label: "ATS Optimized", desc: "Beat the bots", color: "text-emerald-400" },
            { icon: Cpu, label: "Gemini AI", desc: "Advanced engine", color: "text-blue-400" },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              variants={fadeUp}
              transition={{ duration: 0.4 }}
              className="rounded-xl border border-glass-border bg-glass-bg backdrop-blur-md p-4 text-center transition-all duration-300 hover:border-primary/20 hover:shadow-[0_0_20px_rgba(139,92,246,0.06)] group"
            >
              <stat.icon className={`h-5 w-5 ${stat.color} mx-auto mb-2 opacity-70 group-hover:opacity-100 transition-opacity`} />
              <div className="text-sm font-medium text-foreground">{stat.label}</div>
              <div className="text-xs text-muted-foreground">{stat.desc}</div>
            </motion.div>
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
          <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent" />
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[200px] pointer-events-none opacity-30"
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
