"use client";

import { useState, useEffect } from "react";
import { Settings, Key, CheckCircle, AlertCircle, ExternalLink, Cpu, RefreshCw } from "lucide-react";
import { clearCachedModels, fetchAvailableModels, getModelOptions, setApiKey as storeApiKey } from "@/lib/ai/gemini";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gemini-2.0-flash");
  const [modelOptions, setModelOptions] = useState<string[]>(getModelOptions());
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelSaved, setModelSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testDiagnostics, setTestDiagnostics] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("gemini_api_key")?.trim();
    if (stored) {
      setApiKey(stored);
      setHasKey(true);
      void loadAvailableModels(stored);
    }
    const storedModel = localStorage.getItem("gemini_model")?.trim();
    if (storedModel) setSelectedModel(storedModel);
  }, []);

  const loadAvailableModels = async (keyToUse: string) => {
    const key = keyToUse.trim();
    if (!key) return;

    setModelsLoading(true);
    try {
      const models = await fetchAvailableModels(key);
      const filtered = models.filter((model) => {
        const lower = model.toLowerCase();
        return !lower.includes("preview") && !lower.includes("experimental") && !lower.includes("exp-");
      });
      const finalModels = filtered.length > 0 ? filtered : models;
      setModelOptions(finalModels);

      setSelectedModel((prev) => {
        if (finalModels.includes(prev)) return prev;
        const next = finalModels[0] || "gemini-2.0-flash";
        localStorage.setItem("gemini_model", next);
        return next;
      });
    } finally {
      setModelsLoading(false);
    }
  };

  const handleSave = () => {
    const trimmed = apiKey.trim();
    if (trimmed) {
      storeApiKey(trimmed);
      setHasKey(true);
      setSaved(true);
      void loadAvailableModels(trimmed);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const handleClear = () => {
    localStorage.removeItem("gemini_api_key");
    localStorage.removeItem("gemini_model");
    clearCachedModels();
    setApiKey("");
    setHasKey(false);
    setModelOptions(getModelOptions());
    setSelectedModel("gemini-2.0-flash");
    setTestResult(null);
    setTestDiagnostics(null);
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    localStorage.setItem("gemini_model", model);
    setModelSaved(true);
    setTestResult(null);
    setTestDiagnostics(null);
    setTimeout(() => setModelSaved(false), 2000);
  };

  const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Request timed out. Check your network and retry.")), ms);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  const testConnection = async () => {
    if (!apiKey.trim()) {
      setTestResult({ ok: false, message: "Please enter an API key first." });
      setTestDiagnostics("Validation: Missing API key input");
      return;
    }

    setTesting(true);
    setTestResult(null);
    setTestDiagnostics(null);

    try {
      const key = apiKey.trim();
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
      const resp = await withTimeout(fetch(endpoint, { method: "GET" }), 15000);

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => "");
        const combined = `${resp.status} ${resp.statusText} ${errorText}`;
        const lower = combined.toLowerCase();
        const compactBody = errorText.replace(/\s+/g, " ").trim();

        let reason = compactBody || resp.statusText || "Unknown error";
        if (compactBody) {
          try {
            const parsed = JSON.parse(errorText) as {
              error?: {
                status?: string;
                message?: string;
              };
            };
            const statusPart = parsed.error?.status || "";
            const messagePart = parsed.error?.message || "";
            const parsedReason = [statusPart, messagePart].filter(Boolean).join(" | ");
            if (parsedReason) reason = parsedReason;
          } catch {
            // Keep compact raw body when response is not JSON.
          }
        }

        setTestDiagnostics(`HTTP ${resp.status} ${resp.statusText || ""} | ${reason.slice(0, 220)}`.trim());

        if (resp.status === 401 || resp.status === 403 || lower.includes("api key") || lower.includes("permission")) {
          setTestResult({ ok: false, message: "🔑 Invalid API key. Please check and try again." });
          return;
        }

        if (resp.status === 429 || lower.includes("quota") || lower.includes("rate")) {
          setTestResult({
            ok: false,
            message: "⚠️ Google API quota/rate limit is exhausted for this account/project. A new key alone will not fix this.",
          });
          return;
        }

        setTestResult({ ok: false, message: `Error: ${combined.slice(0, 160)}` });
        return;
      }

      type ListModelsResponse = {
        models?: Array<{
          name?: string;
          supportedGenerationMethods?: string[];
        }>;
      };

      const data = (await resp.json()) as ListModelsResponse;
      const discovered = (data.models || [])
        .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
        .map((m) => (m.name?.startsWith("models/") ? m.name.slice("models/".length) : m.name || ""))
        .filter((name) => name.toLowerCase().startsWith("gemini"))
        .filter((name) => !name.toLowerCase().includes("embedding"));

      const finalModels = Array.from(new Set(discovered));
      if (finalModels.length > 0) {
        setModelOptions(finalModels);
        if (!finalModels.includes(selectedModel)) {
          const next = finalModels[0];
          setSelectedModel(next);
          localStorage.setItem("gemini_model", next);
        }
      }

      setTestResult({
        ok: true,
        message:
          finalModels.length > 0
            ? `✅ API key is valid. ${finalModels.length} Gemini models are accessible. (This check does not consume generation quota.)`
            : "✅ API key is valid, but no Gemini generateContent models were returned for this project.",
      });
      setTestDiagnostics(`HTTP ${resp.status} ${resp.statusText || "OK"} | listModels succeeded`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("err_network_changed")) {
        setTestResult({ ok: false, message: "🌐 Network changed during request. Please retry." });
        setTestDiagnostics(`Network: ${msg.slice(0, 220)}`);
        return;
      }
      if (msg.includes("429") || msg.toLowerCase().includes("quota")) {
        setTestResult({ ok: false, message: "⚠️ Google API quota/rate limit exhausted. This is account/project-side, not a key format issue." });
        setTestDiagnostics(`Quota: ${msg.slice(0, 220)}`);
      } else if (msg.includes("401") || msg.includes("403")) {
        setTestResult({ ok: false, message: "🔑 Invalid API key. Please check and try again." });
        setTestDiagnostics(`Auth: ${msg.slice(0, 220)}`);
      } else if (msg.includes("404")) {
        setTestResult({ ok: false, message: "❌ API endpoint/model metadata not found. Try again in a minute." });
        setTestDiagnostics(`Not found: ${msg.slice(0, 220)}`);
      } else {
        setTestResult({ ok: false, message: `Error: ${msg.slice(0, 150)}` });
        setTestDiagnostics(`Unhandled: ${msg.slice(0, 220)}`);
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="max-w-5xl mx-auto">
      <PageHeader
        icon={Settings}
        title="API Settings"
        subtitle="Configure your Gemini API key"
      />

      {/* Status Banner */}
      <div className={`mb-6 p-4 rounded-2xl border transition-all duration-300 flex items-center gap-3 ${
        hasKey
          ? "border-success/30 bg-success/5 shadow-[0_0_20px_rgba(16,185,129,0.08)]"
          : "border-amber-500/30 bg-amber-500/5 shadow-[0_0_20px_rgba(245,158,11,0.08)]"
      }`}>
        {hasKey ? (
          <CheckCircle className="h-5 w-5 text-success shrink-0" />
        ) : (
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
        )}
        <span className={`text-sm font-medium ${hasKey ? "text-success" : "text-amber-500"}`}>
          {hasKey ? "API key configured — all features are active" : "No API key set — features won't work without it"}
        </span>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Left: API Key */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-9 w-9 rounded-lg bg-linear-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Key className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold">Gemini API Key</h2>
                <p className="text-[11px] text-muted-foreground">Your key is stored locally in the browser</p>
              </div>
            </div>
            <div className="space-y-1.5 mb-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSave();
                }}
              >
                <label className="text-xs font-medium text-muted-foreground">API Key</label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Gemini API key..."
                />
              </form>
            </div>
            <div className="flex gap-3">
              <Button onClick={handleSave} className="gap-1.5" type="button">
                {saved ? (
                  <><CheckCircle className="h-3.5 w-3.5" /> Saved!</>
                ) : (
                  "Save Key"
                )}
              </Button>
              {hasKey && (
                <Button variant="destructive" onClick={handleClear} size="sm" type="button">
                  Clear Key
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right: Model Selection */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-lg bg-linear-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <Cpu className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold">AI Model</h2>
                {modelSaved && <span className="text-[11px] text-success">Saved!</span>}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mb-4">
              {modelsLoading ? "Detecting models available for this API key..." : "Choose a model supported by your current API key/project."}
            </p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {modelOptions.map((model) => (
                <button
                  key={model}
                  onClick={() => handleModelChange(model)}
                  className={`text-left p-3 rounded-xl border transition-all duration-300 ${
                    selectedModel === model
                      ? "border-primary/40 bg-primary/10 shadow-[0_0_15px_rgba(139,92,246,0.12)] ring-1 ring-primary/20"
                      : "border-glass-border bg-glass-bg hover:border-[rgba(139,92,246,0.2)] hover:bg-surface-3"
                  }`}
                >
                  <div className="text-xs font-semibold">{model}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {model === "gemini-2.0-flash" && "Newest & fastest"}
                    {model.includes("flash") && model !== "gemini-2.0-flash" && "Fast and cost-efficient"}
                    {model.includes("pro") && "Most capable model"}
                    {!model.includes("flash") && !model.includes("pro") && "Supported model"}
                  </div>
                </button>
              ))}
            </div>

            <Button
              variant="secondary"
              onClick={testConnection}
              disabled={testing}
              className="gap-2 w-full"
            >
              <RefreshCw className={`h-4 w-4 ${testing ? "animate-spin" : ""}`} />
              {testing ? "Testing..." : "Test Connection"}
            </Button>

            {testResult && (
              <div className={`mt-3 p-3 rounded-xl border text-xs backdrop-blur-sm ${
                testResult.ok
                  ? "bg-success/10 border-success/30 text-success"
                  : "bg-destructive/10 border-destructive/30 text-destructive"
              }`}>
                {testResult.message}
              </div>
            )}

            {testDiagnostics && (
              <div className="mt-2 rounded-lg border border-glass-border bg-glass-bg/60 px-3 py-2 text-[11px] text-muted-foreground wrap-break-word">
                <span className="font-semibold">Diagnostics:</span> {testDiagnostics}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tips & Instructions — full width grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <span className="text-base">💡</span> Quota & Rate Limit Tips
            </h3>
            <ul className="space-y-2.5 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40 mt-1.5 shrink-0" />
                Free tier has limited requests per minute/day per model
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40 mt-1.5 shrink-0" />
                If one model gets rate-limited, switch to another model shown in your available list
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40 mt-1.5 shrink-0" />
                The app uses conservative retries to avoid burning quota too quickly
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40 mt-1.5 shrink-0" />
                <strong className="text-foreground">Test Connection</strong> validates key/model access without using generation quota
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40 mt-1.5 shrink-0" />
                Wait 1-2 minutes between heavy operations to avoid rate limits
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <span className="text-base">🔑</span> How to get a Gemini API Key
            </h3>
            <ol className="space-y-2.5 text-xs text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <span className="bg-primary/20 text-primary w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 shrink-0">1</span>
                Visit Google AI Studio
              </li>
              <li className="flex items-start gap-2.5">
                <span className="bg-primary/20 text-primary w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 shrink-0">2</span>
                Sign in with your Google account
              </li>
              <li className="flex items-start gap-2.5">
                <span className="bg-primary/20 text-primary w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 shrink-0">3</span>
                Click &ldquo;Get API Key&rdquo; and create a key
              </li>
              <li className="flex items-start gap-2.5">
                <span className="bg-primary/20 text-primary w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 shrink-0">4</span>
                Paste the key above and save
              </li>
            </ol>
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-4 text-xs text-primary hover:text-primary-hover transition-colors font-medium"
            >
              Open Google AI Studio <ExternalLink className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
