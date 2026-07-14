/**
 * Deterministic Foundry document ids (R6).
 *
 * Foundry document _id is a 16-char string from its own alphanumeric alphabet
 * (A–Z, a–z, 0–9). We DERIVE ids from stable OnlyWorlds inputs so re-running the
 * converter on the same world yields the same module (idempotent, diff-friendly,
 * and cross-page @UUID links stay valid):
 *
 *   - JournalEntry id  = derive(worldId + "|type|" + typeName)
 *   - JournalEntryPage id = derive(elementUuid + "|page")
 *
 * Derivation: sha256(input) → hex → map successive bytes into Foundry's 62-char
 * alphabet, take 16 chars. sha256 gives 32 bytes, far more than the 16 we need,
 * and the mapping is uniform enough that collisions are astronomically unlikely
 * for the element counts a single world holds. A collision-sanity test guards it.
 */

import { createHash } from "node:crypto";

// Foundry's id alphabet (see foundry randomID): A–Z, a–z, 0–9.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Deterministic 16-char Foundry id from an arbitrary string input. */
export function foundryId(input) {
  const digest = createHash("sha256").update(String(input), "utf8").digest();
  let out = "";
  for (let i = 0; i < 16; i++) {
    // Each digest byte (0–255) mapped into the 62-char alphabet.
    out += ALPHABET[digest[i] % ALPHABET.length];
  }
  return out;
}

/** JournalEntry id for an OW element type within a world. */
export function journalId(worldId, typeName) {
  return foundryId(`${worldId}|type|${typeName}`);
}

/** JournalEntryPage id for an OW element. */
export function pageId(elementUuid) {
  return foundryId(`${elementUuid}|page`);
}
