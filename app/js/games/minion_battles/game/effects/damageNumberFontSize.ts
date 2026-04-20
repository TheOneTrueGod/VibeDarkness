/**
 * Maps dealt damage to a display font size for floating damage numbers.
 * Small hits stay readable (~10px); large hits grow toward ~40px.
 */
export function damageAmountToDisplayFontSize(amount: number): number {
    if (amount <= 0) return 10;
    const t = Math.min(1, amount / 75);
    return Math.round(10 + t * 30);
}
