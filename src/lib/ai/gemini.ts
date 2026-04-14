import { GoogleGenerativeAI } from "@google/generative-ai";

let apiKey: string | null = null;

// Conservative default list used before dynamic model discovery succeeds.
const MODEL_OPTIONS = ["gemini-2.0-flash"];
const MODELS_CACHE_KEY = "gemini_available_models_cache";
const MODELS_CACHE_TTL_MS = 5 * 60 * 1000;

type ListModelsResponse = {
  models?: Array<{
    name?: string;
    supportedGenerationMethods?: string[];
  }>;
};

type CachedModels = {
  models: string[];
  ts: number;
  keyFingerprint: string;
};

export function setApiKey(key: string) {
  apiKey = key;
  if (typeof window !== "undefined") {
    localStorage.setItem("gemini_api_key", key);
  }
}

export function getApiKey(): string | null {
  if (apiKey) return apiKey;
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("gemini_api_key");
    if (stored) {
      apiKey = stored;
      return stored;
    }
  }
  return null;
}

export function getSelectedModel(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("gemini_model") || "gemini-2.0-flash";
  }
  return "gemini-2.0-flash";
}

export function setSelectedModel(model: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("gemini_model", model);
  }
}

export function getModelOptions(): string[] {
  return MODEL_OPTIONS;
}

export function clearCachedModels() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(MODELS_CACHE_KEY);
  }
}

function normalizeModelName(rawName: string): string {
  return rawName.startsWith("models/") ? rawName.slice("models/".length) : rawName;
}

function supportsGenerateContent(methods: string[] | undefined): boolean {
  return Array.isArray(methods) && methods.includes("generateContent");
}

function rankModel(modelName: string): number {
  const priority = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.5-pro",
    "gemini-2.0-pro",
  ];

  const index = priority.indexOf(modelName);
  return index >= 0 ? index : priority.length + 1;
}

function getKeyFingerprint(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) % 1000000007;
  }
  return `k${hash}`;
}

export async function fetchAvailableModels(keyOverride?: string): Promise<string[]> {
  const key = (keyOverride || getApiKey() || "").trim();
  if (!key) return MODEL_OPTIONS;

  const keyFingerprint = getKeyFingerprint(key);

  if (typeof window !== "undefined") {
    const cached = localStorage.getItem(MODELS_CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as CachedModels;
        const isFresh = Date.now() - parsed.ts < MODELS_CACHE_TTL_MS;
        const sameKey = parsed.keyFingerprint === keyFingerprint;
        if (isFresh && sameKey && Array.isArray(parsed.models) && parsed.models.length > 0) {
          return parsed.models;
        }
      } catch {
        // Ignore malformed cache and fetch fresh data.
      }
    }
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
  const resp = await fetch(endpoint, { method: "GET" });

  if (!resp.ok) {
    return MODEL_OPTIONS;
  }

  const data = (await resp.json()) as ListModelsResponse;
  const discovered = (data.models || [])
    .filter((m) => supportsGenerateContent(m.supportedGenerationMethods))
    .map((m) => normalizeModelName(m.name || ""))
    .filter((name) => name.toLowerCase().startsWith("gemini"))
    .filter((name) => !name.toLowerCase().includes("embedding"));

  const unique = Array.from(new Set(discovered)).sort((a, b) => {
    const rankDiff = rankModel(a) - rankModel(b);
    return rankDiff !== 0 ? rankDiff : a.localeCompare(b);
  });

  const finalModels = unique.length > 0 ? unique : MODEL_OPTIONS;

  if (typeof window !== "undefined") {
    localStorage.setItem(
      MODELS_CACHE_KEY,
      JSON.stringify({ models: finalModels, ts: Date.now(), keyFingerprint })
    );
  }

  return finalModels;
}

// Tool definition for Google Search grounding
export type GeminiTool =
  | { googleSearch: Record<string, never> }
  | { codeExecution: Record<string, never> };

type GenerateOptions = {
  maxRetries?: number;
  retryDelay?: number;
  enableModelFallback?: boolean;
  tools?: GeminiTool[]; // optional: pass [{ googleSearch: {} }] to enable grounding
};

function isRateLimitError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    message.includes("429") ||
    lower.includes("quota") ||
    lower.includes("rate") ||
    lower.includes("resource_exhausted") ||
    lower.includes("too many requests")
  );
}

function isServerError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    message.includes("500") ||
    message.includes("503") ||
    lower.includes("internal") ||
    lower.includes("unavailable")
  );
}

/** Parse Gemini API errors into user-friendly messages */
function parseGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  // Rate limit / quota exceeded (429)
  if (isRateLimitError(raw)) {
    const retryMatch = raw.match(/retry\s*(?:in|after|delay[":]*)\s*"?(\d+)/i);
    const retrySeconds = retryMatch ? retryMatch[1] : null;
    return `⚠️ API quota exceeded for this model. ${
      retrySeconds ? `Try again in ~${retrySeconds}s. ` : ""
    }You can:\n• Wait a minute and retry\n• Switch to another available model in Settings\n• Use a different API key/project (quota is shared at project level)`;
  }

  // Invalid API key (400/401/403)
  if (raw.includes("401") || raw.includes("403") || raw.toLowerCase().includes("api key") || raw.toLowerCase().includes("permission")) {
    return "🔑 Invalid or expired API key. Please check your Gemini API key in Settings.";
  }

  // Model not found
  if (raw.includes("404") || raw.toLowerCase().includes("not found") || raw.toLowerCase().includes("is not supported")) {
    return "❌ Model not available. Try switching to a different model in Settings.";
  }

  // Safety / content filter
  if (raw.toLowerCase().includes("safety") || raw.toLowerCase().includes("blocked")) {
    return "🛡️ Content was blocked by safety filters. Try rephrasing your input.";
  }

  // Network errors
  if (raw.toLowerCase().includes("network") || raw.toLowerCase().includes("fetch") || raw.toLowerCase().includes("econnrefused")) {
    return "🌐 Network error. Please check your internet connection and try again.";
  }

  // Generic — show a truncated version of the raw message
  if (raw.length > 200) {
    return `Error: ${raw.slice(0, 180)}…`;
  }
  return `Error: ${raw}`;
}

/**
 * Main function: generate content with conservative retries to avoid quota burn.
 * Optionally pass `tools: [{ googleSearch: {} }]` to enable Google Search grounding
 * for real-time web results. All existing callers without tools are unaffected.
 */
export async function generateWithRetry(
  prompt: string,
  options?: GenerateOptions
): Promise<string> {
  const key = getApiKey();
  if (!key) throw new Error("🔑 No API key configured. Go to Settings to add your Gemini API key.");

  const maxRetries = options?.maxRetries ?? 1;
  const baseDelay = options?.retryDelay ?? 3000;
  const enableModelFallback = options?.enableModelFallback ?? false;
  const tools = options?.tools;
  const selectedModel = getSelectedModel();

  // Default: only selected model. Optional fallback can be enabled by caller.
  const modelsToTry = enableModelFallback
    ? [selectedModel, ...MODEL_OPTIONS.filter((m) => m !== selectedModel)]
    : [selectedModel];

  const genAI = new GoogleGenerativeAI(key);
  let lastError: unknown = null;

  for (const modelName of modelsToTry) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
        // Only pass tools when provided — keeps existing calls identical
          ...(tools && tools.length > 0 ? { tools: tools as never } : {}),
        });

        const result = await model.generateContent(prompt);
        return result.response.text();
      } catch (err: unknown) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        const rateLimited = isRateLimitError(msg);
        const transientServerError = isServerError(msg);

        // Retry only transient server failures, not quota/rate-limit failures.
        if (transientServerError && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        // For 429/rate-limit, optionally try next model (if explicitly enabled).
        if (rateLimited) {
          if (enableModelFallback) break;
          throw new Error(parseGeminiError(err));
        }

        // For non-retryable errors, throw immediately
        throw new Error(parseGeminiError(err));
      }
    }
  }

  // All models and retries exhausted
  throw new Error(parseGeminiError(lastError));
}

// Keep backward compat
export function getGeminiModel() {
  const key = getApiKey();
  if (!key) throw new Error("🔑 No API key configured. Go to Settings to add your Gemini API key.");
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({ model: getSelectedModel() });
}

export async function generateContent(prompt: string): Promise<string> {
  return generateWithRetry(prompt);
}
