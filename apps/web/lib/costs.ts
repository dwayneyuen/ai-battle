export type OpenRouterUsage =
  | {
      ok: true;
      totalUsage: number; // $ spent to date
      totalCredits: number; // $ loaded to date
      remaining: number; // $ left
    }
  | { ok: false; error: string };

export type NeonUsage =
  | {
      ok: true;
      projects: number;
      computeHours: number;
      storageGiB: number | null;
    }
  | { ok: false; error: string };

/**
 * Live Neon usage for the current billing period. Neon's API returns *usage*
 * (compute time, storage), not a dollar figure — the $ depends on your plan —
 * so we surface the usage and keep the configurable $ estimate alongside it.
 * Uses GET /projects (each project carries its current-period metrics), which
 * only needs the API key — no org id or date range.
 */
export async function getNeonUsage(): Promise<NeonUsage> {
  const key = process.env.NEON_API_KEY;
  if (!key) return { ok: false, error: "NEON_API_KEY not set" };
  try {
    const res = await fetch("https://console.neon.tech/api/v2/projects", {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `Neon API ${res.status}` };
    const json = (await res.json()) as { projects?: Record<string, unknown>[] };
    const projects = json.projects ?? [];
    let computeSeconds = 0;
    let storageBytes = 0;
    for (const p of projects) {
      computeSeconds += Number(p.compute_time_seconds ?? p.cpu_used_sec ?? 0);
      storageBytes += Number(p.synthetic_storage_size ?? 0);
    }
    return {
      ok: true,
      projects: projects.length,
      computeHours: computeSeconds / 3600,
      storageGiB: storageBytes ? storageBytes / 1024 ** 3 : null,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Live OpenRouter credit usage (the dominant variable cost). */
export async function getOpenRouterUsage(): Promise<OpenRouterUsage> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { ok: false, error: "OPENROUTER_API_KEY not set" };
  try {
    const res = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, error: `OpenRouter API ${res.status}` };
    }
    const json = (await res.json()) as {
      data?: { total_credits?: number; total_usage?: number };
    };
    const d = json.data ?? {};
    const totalCredits = Number(d.total_credits ?? 0);
    const totalUsage = Number(d.total_usage ?? 0);
    return {
      ok: true,
      totalUsage,
      totalCredits,
      remaining: totalCredits - totalUsage,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
