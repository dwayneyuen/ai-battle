import { PROVIDERS, type ProviderInfo } from "@ai-battle/catalog";

function CostBadge({ cost }: { cost: ProviderInfo["cost"] }) {
  return <span className={`cost ${cost}`}>{cost}</span>;
}

export default function ModelsPage() {
  const freeCount = PROVIDERS.filter((p) => p.freeTier).length;

  return (
    <>
      <section className="hero">
        <h1>The models</h1>
        <p>
          Any of these providers can fill a seat with a{" "}
          <code>provider:model</code> spec — so virtually every frontier and
          open model can compete. {PROVIDERS.length} providers, {freeCount} with
          a no-cost path.
        </p>
      </section>

      <div className="table-wrap">
        <table className="providers">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Example spec</th>
              <th>Cost</th>
              <th>Free path</th>
              <th>API key</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {PROVIDERS.map((p) => (
              <tr key={p.id}>
                <td className="provider-name">{p.name}</td>
                <td>
                  <code>{p.exampleSpec}</code>
                </td>
                <td>
                  <CostBadge cost={p.cost} />
                </td>
                <td>{p.freeTier ? "✓" : "—"}</td>
                <td>{p.envVar ? <code>{p.envVar}</code> : "—"}</td>
                <td className="notes">{p.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="legend">
        Tip: a single <strong>OpenRouter</strong> key reaches almost every model
        (Grok, Llama, DeepSeek, Qwen, GPT, Claude, Gemini) via the{" "}
        <code>openrouter:</code> prefix.
      </p>
    </>
  );
}
