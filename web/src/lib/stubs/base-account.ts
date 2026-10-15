/**
 * Stub for `@base-org/account`. wagmi's Base Account connector lazy-imports it, and its
 * dependency tree pulls optional packages (@x402/*) that are not installed. Wayfare does
 * not offer the Base Account wallet, so the import is aliased here (see next.config.ts).
 */
export function createBaseAccountSDK(): never {
  throw new Error("Base Account wallet is not supported in Wayfare");
}
export default { createBaseAccountSDK };
