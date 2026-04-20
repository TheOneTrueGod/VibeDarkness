/**
 * Descriptive values are player-facing magnitude labels used in research/tooltip copy.
 * Keep these highlighted in UI text by wrapping with `{}` (for example: `{Tiny}`).
 */
export enum DescriptiveValue {
    /** Smallest visible change. Approximately a 10% adjustment. */
    Tiny = 'Tiny',
    /** Light adjustment. Approximately a 20% adjustment. */
    Small = 'Small',
    /** Noticeable adjustment. Approximately a 30% adjustment. */
    Medium = 'Medium',
    /** Strong adjustment. Approximately a 40% adjustment. */
    Large = 'Large',
    /** Biggest adjustment. Approximately a 50% adjustment. */
    Huge = 'Huge',
}

export const DESCRIPTIVE_VALUE_APPROX_PCT: Record<DescriptiveValue, number> = {
    [DescriptiveValue.Tiny]: 0.10,
    [DescriptiveValue.Small]: 0.20,
    [DescriptiveValue.Medium]: 0.30,
    [DescriptiveValue.Large]: 0.40,
    [DescriptiveValue.Huge]: 0.50,
};

/**
 * Returns an integer increase based on the provided descriptive value.
 * - Uses rounded percent change for human-readable values.
 * - Ensures a visible increase of at least +1 for positive bases.
 */
export function getApproxIntegerIncrease(baseValue: number, value: DescriptiveValue): number {
    if (baseValue <= 0) return 0;
    const pct = DESCRIPTIVE_VALUE_APPROX_PCT[value];
    return Math.max(1, Math.round(baseValue * pct));
}
