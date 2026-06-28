interface AmmoBarProps {
    current: number;
    max: number;
}

const BULLET_COUNT = 20;

// Pointed-top bullet silhouette
const BULLET_CLIP = 'polygon(0% 100%, 0% 28%, 50% 0%, 100% 28%, 100% 100%)';

export function AmmoBar({ current, max }: AmmoBarProps) {
    const ammoPerBullet = max / BULLET_COUNT;
    const filledBullets = Math.floor(current / ammoPerBullet);

    return (
        <div className="flex h-4 items-end gap-0.5">
            {Array.from({ length: BULLET_COUNT }, (_, i) => (
                <div
                    key={i}
                    className={`h-[14px] w-1.5 shrink-0 transition-colors duration-100 ${
                        i < filledBullets
                            ? 'bg-yellow-400'
                            : 'bg-yellow-900/30 ring-1 ring-inset ring-yellow-700/50'
                    } ${i === 0 ? 'ml-px' : ''}`}
                    style={{ clipPath: BULLET_CLIP }}
                />
            ))}
        </div>
    );
}
