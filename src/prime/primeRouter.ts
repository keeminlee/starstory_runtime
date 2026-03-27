// meepo-bot — Prime router
// Thin routing layer only. No Prime logic lives here.
// Receives a /lab prime interaction, defers, calls the Prime seam, renders result.

import type { CommandCtx } from "../commands/index.js";
import { callPrime } from "./primeAdapter.js";

/**
 * Handle a /lab prime interaction.
 * Defers reply immediately (satisfies Discord's 3s ACK window),
 * calls the Prime adapter, and edits the reply with the result.
 */
export async function routeToPrime(
  interaction: any,
  _ctx: CommandCtx | null
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const input = interaction.options.getString("input", true) as string;

  try {
    const result = await callPrime(input);
    await interaction.editReply({ content: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply({ content: `Prime error: ${message}` });
  }
}
