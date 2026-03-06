import type { Persona } from "../personas/index.js";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type RetrievalContext = {
  core_memories: Array<{ memory_id: string; title: string; text: string }>;
  relevant_memories: Array<{ memory_id: string; title: string; text: string; score: number }>;
};

export type MeepoContextSnapshot = {
  context?: string;
  hasVoice?: boolean;
  partyMemory?: string;
  convoTail?: string;
};

export type BuildMeepoPromptBundleInput = {
  guild_id: string;
  campaign_slug: string;
  session_id: string;
  anchor_ledger_id: string;
  trace_id?: string;
  interaction_id?: string;
  mode_at_start?: "canon" | "ambient" | "lab" | "dormant" | null;
  is_meta_prompt?: boolean;
  user_text: string;
  meepo_context_snapshot: MeepoContextSnapshot;
  persona: Persona;
  meepo_persona_seed?: string | null;
  retrieval?: {
    top_k?: number;
    algo_version?: string;
  };
};

export type PromptBundle = {
  system: string;
  messages: ChatMessage[];
  retrieval?: RetrievalContext;
  metadata: {
    campaign_slug: string;
    session_id: string;
    anchor_ledger_id: string;
  };
  debug: {
    context_hash: string;
    retrieval_hash?: string;
  };
};
