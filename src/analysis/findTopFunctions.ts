import { findLikelyTopFunctions } from "./topFunctionDetection";

/**
 * Rank likely HLS top functions from most to least likely.
 * The ranking prefers interface/loop-rich kernels over testbench mains,
 * wrappers, and helper-only functions.
 */
export function findTopFunctions(code: string): string[] {
    return findLikelyTopFunctions(code);
}
