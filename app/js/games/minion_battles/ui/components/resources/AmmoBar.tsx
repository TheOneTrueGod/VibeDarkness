interface AmmoBarProps {
    current: number;
    max: number;
}

const BULLET_COUNT = 10;

// Pointed-top bullet silhouette
const BULLET_CLIP = 'polygon(0% 100%, 0% 28%, 50% 0%, 100% 28%, 100% 100%)';

export function AmmoBar({ current, max }: AmmoBarProps) {
    const ammoPerBullet = max / BULLET_COUNT;
    const filledBullets = Math.floor(current / ammoPerBullet);

    return (
        <div className="flex h-5 items-end gap-0.5">
            {Array.from({ length: BULLET_COUNT }, (_, i) => (
                <div
                    key={i}
                    className={`h-full w-3 shrink-0 transition-colors duration-100 ${
                        i < filledBullets
                            ? 'bg-yellow-400'
                            : 'border border-yellow-900/40 bg-dark-800/60'
                    }`}
                    style={{ clipPath: BULLET_CLIP }}
                />
            ))}
        </div>
    );
}
