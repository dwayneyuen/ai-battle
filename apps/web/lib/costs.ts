export type OpenRouterUsage =
  | {
      ok: true;
      totalUsage: number; // $ spent to date
      totalCredits: number; // $ loaded to date
      remaining: number; // $ left
    }
  | { ok: false; error: string };

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
