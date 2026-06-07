export * from "./mafia/types";
// Re-export the runtime values explicitly too — bundlers (Turbopack) don't
// always trace value exports through `export *` across package boundaries.
export { TransportError } from "./mafia/types";
export { runMafia } from "./mafia/engine";

export * from "./prisoners-dilemma/types";
export { runMatch, runTournament } from "./prisoners-dilemma/engine";
export * from "./prisoners-dilemma/strategies";

export { mulberry32, shuffle, pick } from "./rng";
