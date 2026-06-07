/**
 * The catalog is the single source of truth for what AI Battle supports:
 * which games exist (or are planned), the features each one does/doesn't
 * support, and which model providers can be plugged in. The website and the
 * `pnpm catalog` CLI both render this data — so the published status is always
 * in sync with the code.
 */

// --- Games -----------------------------------------------------------------

export type GameStatus = "playable" | "planned";

/** Capabilities a game exercises — these become the columns of the site's matrix. */
export interface GameFeatures {
  /** Secret roles or hidden cards (social deduction, bluffing). */
  hiddenInfo: boolean;
  /** Players commit moves at the same time, then reveal. */
  simultaneousMoves: boolean;
  /** Free-form natural-language communication between players. */
  negotiation: boolean;
  /** In-play chance: dice rolls or card draws. */
  randomness: boolean;
  /** Players belong to teams that win or lose together. */
  teamBased: boolean;
  /** Players can be knocked out before the game ends. */
  elimination: boolean;
}

export interface GameInfo {
  id: string;
  name: string;
  status: GameStatus;
  /** Supported player counts. */
  players: { min: number; max: number };
  /** One- or two-sentence description for cards/headers. */
  blurb: string;
  features: GameFeatures;
  /** What the initial (simplified) version intentionally leaves out. */
  notSupported: string[];
}

/** Column metadata for rendering the feature matrix, in display order. */
export const GAME_FEATURE_LABELS: { key: keyof GameFeatures; label: string }[] =
  [
    { key: "hiddenInfo", label: "Hidden info" },
    { key: "simultaneousMoves", label: "Simultaneous" },
    { key: "negotiation", label: "Negotiation" },
    { key: "randomness", label: "Randomness" },
    { key: "teamBased", label: "Team-based" },
    { key: "elimination", label: "Elimination" },
  ];

export const GAMES: GameInfo[] = [
  {
    id: "rolloff",
    name: "Roll-Off",
    status: "playable",
    players: { min: 2, max: 8 },
    blurb:
      "A pure-luck dice race used as a smoke test. Each round every player predicts a die roll, but the dealer rolls a fair die — so the prediction never matters and every player wins exactly 1/N. Any deviation over a large sample flags a bug in the harness, not model skill.",
    features: {
      hiddenInfo: false,
      simultaneousMoves: true,
      negotiation: false,
      randomness: true,
      teamBased: false,
      elimination: false,
    },
    notSupported: [
      "Decisions that affect the outcome (intentional — it's a skill-independent control)",
    ],
  },
  {
    id: "prisoners-dilemma",
    name: "Prisoner's Dilemma",
    status: "playable",
    players: { min: 2, max: 2 },
    blurb:
      "The iterated game from Axelrod's tournament and The Selfish Gene. Models play Cooperate/Defect over many rounds; a round-robin ranks them by total score.",
    features: {
      hiddenInfo: false,
      simultaneousMoves: true,
      negotiation: false,
      randomness: false,
      teamBased: false,
      elimination: false,
    },
    notSupported: [
      "Pre-round negotiation / cheap talk",
      "Probabilistic match length (unknown horizon)",
      "N-player public-goods variant",
      "Execution noise",
    ],
  },
  {
    id: "mafia",
    name: "Mafia",
    status: "playable",
    players: { min: 5, max: 15 },
    blurb:
      "Social deduction. A hidden mafia kills by night while the town debates and votes by day. Town wins by eliminating all mafia; mafia win at parity.",
    features: {
      hiddenInfo: true,
      simultaneousMoves: false,
      negotiation: true,
      randomness: false,
      teamBased: true,
      elimination: true,
    },
    notSupported: [
      "Advanced roles (Jester, Godfather, Vigilante, …)",
      "Nomination → defense → final-vote flow",
      "Hidden role-reveal options",
    ],
  },
  {
    id: "coup",
    name: "Coup",
    status: "planned",
    players: { min: 2, max: 6 },
    blurb:
      "Bluffing card game. Claim character powers (Duke, Assassin, Captain, Ambassador, Contessa), bluff freely, and challenge others. Last influence standing wins.",
    features: {
      hiddenInfo: true,
      simultaneousMoves: false,
      negotiation: true,
      randomness: true,
      teamBased: false,
      elimination: true,
    },
    notSupported: [
      "Reformation / Inquisitor expansions",
      "Team allegiance variants",
    ],
  },
  {
    id: "avalon",
    name: "Avalon",
    status: "planned",
    players: { min: 5, max: 10 },
    blurb:
      "Team-based hidden-role deduction. Good vs. Evil over five quests; Merlin secretly knows the Evil players, but the Assassin can steal the win by identifying Merlin.",
    features: {
      hiddenInfo: true,
      simultaneousMoves: true,
      negotiation: true,
      randomness: false,
      teamBased: true,
      elimination: false,
    },
    notSupported: [
      "Percival, Morgana, Mordred, Oberon",
      "Lady of the Lake",
      "Two-fails rule on quest 4 (7+ players)",
    ],
  },
  {
    id: "catan",
    name: "Catan",
    status: "planned",
    players: { min: 3, max: 4 },
    blurb:
      "Economic strategy on a hex board. Collect resources from dice rolls, build roads/settlements/cities, trade, and race to 10 victory points.",
    features: {
      hiddenInfo: false,
      simultaneousMoves: false,
      negotiation: true,
      randomness: true,
      teamBased: false,
      elimination: false,
    },
    notSupported: [
      "Ports (3:1 / 2:1 harbors)",
      "Full dev-card deck (Knight + VP only)",
      "Free-form trade haggling (structured offers only)",
    ],
  },
  {
    id: "diplomacy",
    name: "Diplomacy",
    status: "planned",
    players: { min: 7, max: 7 },
    blurb:
      "Negotiation and simultaneous orders on pre-WWI Europe. No luck — alliances, betrayal, and supported attacks decide who controls the supply centers.",
    features: {
      hiddenInfo: true,
      simultaneousMoves: true,
      negotiation: true,
      randomness: false,
      teamBased: false,
      elimination: true,
    },
    notSupported: [
      "Convoy orders",
      "Full DATC adjudication / paradoxes",
      "Player-chosen retreats",
      "Build-anywhere variants",
    ],
  },
];

// --- Models / providers ----------------------------------------------------

export type CostTier = "free" | "cheap" | "paid";

export interface ProviderInfo {
  id: string;
  name: string;
  /** Spec prefix used on the CLI, e.g. "openai:". */
  specPrefix: string;
  /** A ready-to-paste example spec. */
  exampleSpec: string;
  /** Env var holding the API key (null for the keyless providers). */
  envVar: string | null;
  cost: CostTier;
  /** Whether there is a usable no-cost path (free tier, local, or keyless). */
  freeTier: boolean;
  notes: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "mock",
    name: "Mock",
    specPrefix: "mock",
    exampleSpec: "mock",
    envVar: null,
    cost: "free",
    freeTier: true,
    notes: "Schema-valid random baseline. No key — runs anywhere.",
  },
  {
    id: "ollama",
    name: "Ollama (local)",
    specPrefix: "ollama:",
    exampleSpec: "ollama:llama3.1",
    envVar: null,
    cost: "free",
    freeTier: true,
    notes: "Runs open models on your own machine for $0.",
  },
  {
    id: "google",
    name: "Google Gemini",
    specPrefix: "google:",
    exampleSpec: "google:gemini-2.5-flash",
    envVar: "GOOGLE_API_KEY",
    cost: "cheap",
    freeTier: true,
    notes: "Free tier at aistudio.google.com.",
  },
  {
    id: "groq",
    name: "Groq",
    specPrefix: "groq:",
    exampleSpec: "groq:llama-3.3-70b-versatile",
    envVar: "GROQ_API_KEY",
    cost: "cheap",
    freeTier: true,
    notes: "Very fast, generous free tier, hosts open models.",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    specPrefix: "openrouter:",
    exampleSpec: "openrouter:x-ai/grok-3",
    envVar: "OPENROUTER_API_KEY",
    cost: "cheap",
    freeTier: true,
    notes: "One key → almost every model; several free ids.",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    specPrefix: "deepseek:",
    exampleSpec: "deepseek:deepseek-chat",
    envVar: "DEEPSEEK_API_KEY",
    cost: "cheap",
    freeTier: false,
    notes: "Very cheap; strong reasoning model available.",
  },
  {
    id: "together",
    name: "Together AI",
    specPrefix: "together:",
    exampleSpec: "together:meta-llama/Llama-3.3-70B-Instruct-Turbo",
    envVar: "TOGETHER_API_KEY",
    cost: "cheap",
    freeTier: false,
    notes: "Hosts many open models (Llama, Qwen, …).",
  },
  {
    id: "mistral",
    name: "Mistral",
    specPrefix: "mistral:",
    exampleSpec: "mistral:mistral-large-latest",
    envVar: "MISTRAL_API_KEY",
    cost: "paid",
    freeTier: false,
    notes: "Mistral's hosted models.",
  },
  {
    id: "xai",
    name: "xAI Grok",
    specPrefix: "xai:",
    exampleSpec: "xai:grok-3",
    envVar: "XAI_API_KEY",
    cost: "paid",
    freeTier: false,
    notes: "Grok 3 / 4 family.",
  },
  {
    id: "openai",
    name: "OpenAI",
    specPrefix: "openai:",
    exampleSpec: "openai:gpt-5-mini",
    envVar: "OPENAI_API_KEY",
    cost: "paid",
    freeTier: false,
    notes: "GPT-5 family; cheap on the mini/nano tiers.",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    specPrefix: "anthropic:",
    exampleSpec: "anthropic:claude-haiku-4-5",
    envVar: "ANTHROPIC_API_KEY",
    cost: "paid",
    freeTier: false,
    notes: "Claude Opus / Sonnet / Haiku; cheap on Haiku.",
  },
];

// --- Convenience -----------------------------------------------------------

export const playableGames = () => GAMES.filter((g) => g.status === "playable");
export const plannedGames = () => GAMES.filter((g) => g.status === "planned");
export const getGame = (id: string) => GAMES.find((g) => g.id === id);
