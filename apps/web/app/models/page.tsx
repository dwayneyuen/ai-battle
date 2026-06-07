import { MODELS } from "@ai-battle/catalog";

export default function ModelsPage() {
  return (
    <>
      <section className="hero">
        <h1>The models</h1>
        <p>
          The {MODELS.length} models that actually compete — one per family,
          each fielded under a pun-name that decodes to it. All are reached
          through a single OpenRouter key.
        </p>
      </section>

      <div className="table-wrap">
        <table className="providers">
          <thead>
            <tr>
              <th>Name</th>
              <th>Family</th>
              <th>Model</th>
              <th>Spec</th>
            </tr>
          </thead>
          <tbody>
            {MODELS.map((m) => (
              <tr key={m.spec}>
                <td className="provider-name">{m.name}</td>
                <td>{m.family}</td>
                <td>{m.model}</td>
                <td>
                  <code>{m.spec}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="legend">
        Each seat&rsquo;s name is a pun on its model (Gepetto = GPT, Quinn =
        Qwen, Brock = Grok, Jiminy = Gemini…), so it&rsquo;s obvious who&rsquo;s
        who in a match.
      </p>
    </>
  );
}
