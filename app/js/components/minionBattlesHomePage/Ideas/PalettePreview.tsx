/**
 * Renders a plan `> [!PALETTE]` card: the same three Armory surfaces
 * (research-tree badge, Charge resource, core icon) painted in one pair.
 */
import type { ReactNode } from 'react';
import { Swords } from 'lucide-react';
import type { PlanPaletteColor } from './plansData';
import {
    CHARGE_MAX,
    CHARGE_MISSION_START,
} from '../../../games/minion_battles/card_defs/10_armory_core/armoryConstants';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function isHex(hex: string): boolean {
    return HEX_RE.test(hex);
}

/** Grip and empty-pip shade. Keeps the icon's three-step metal ramp. */
function darken(hex: string): string {
    const n = parseInt(hex.slice(1), 16);
    const channel = (shift: number) => Math.round(((n >> shift) & 255) * 0.55).toString(16).padStart(2, '0');
    return `#${channel(16)}${channel(8)}${channel(0)}`;
}

function Swatch({ role, color }: { role: string; color: PlanPaletteColor }) {
    const painted = isHex(color.hex);
    return (
        <span className="inline-flex items-center gap-2 text-xs text-gray-300">
            <span
                className="h-3.5 w-3.5 shrink-0 rounded-sm border border-white/20"
                style={painted ? { backgroundColor: color.hex } : undefined}
                aria-hidden
            />
            <span>{role}</span>
            {color.label !== '' && <span className="text-gray-400">{color.label}</span>}
            {painted && <code className="px-1 py-0.5 rounded bg-surface text-[12px] text-primary">{color.hex}</code>}
        </span>
    );
}

function PaletteTreeBadge({ name, primary }: { name: string; primary: string }) {
    const border = isHex(primary) ? primary : undefined;
    return (
        <div data-className="PaletteTreeBadge" className="flex flex-col gap-1">
            <span className="text-xs text-muted">Tree badge</span>
            <div
                className="inline-flex items-center gap-2 rounded-lg border-2 bg-surface px-3 py-2 text-sm font-medium text-gray-200"
                style={border ? { borderColor: border } : undefined}
                aria-label={`${name} tree badge`}
            >
                <Swords className="h-4 w-4 shrink-0" style={border ? { color: border } : undefined} aria-hidden />
                <span>Armory Core</span>
            </div>
        </div>
    );
}

function PaletteChargeResource({ secondary }: { secondary: string }) {
    const color = isHex(secondary) ? secondary : undefined;
    const fillPct = Math.round((CHARGE_MISSION_START / CHARGE_MAX) * 100);
    return (
        <div data-className="PaletteChargeResource" className="flex flex-col gap-1">
            <span className="text-xs text-muted">Charge</span>
            <div
                className="flex items-center gap-1.5"
                aria-label={`Charge ${CHARGE_MISSION_START} of ${CHARGE_MAX}`}
            >
                <span className="relative shrink-0">
                    <span
                        className="flex items-center justify-center rounded-full border bg-neutral-900"
                        style={{ width: 20, height: 20, borderColor: color }}
                    >
                        <Swords size={11} style={color ? { color } : undefined} strokeWidth={2} aria-hidden />
                    </span>
                    <span
                        className="absolute -bottom-0.5 -right-1 rounded px-0.5 text-[8px] font-bold leading-none text-white"
                        style={{ textShadow: '0 0 3px #000, 0 0 3px #000' }}
                    >
                        {CHARGE_MISSION_START}
                    </span>
                </span>
                <div className="relative h-4 w-24 overflow-hidden rounded bg-dark-700">
                    <div
                        className="absolute inset-y-0 left-0 rounded"
                        style={{
                            width: `${fillPct}%`,
                            backgroundColor: color,
                            opacity: 0.85,
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

function PaletteCoreIcon({ name, primary, secondary }: { name: string; primary: string; secondary: string }) {
    const fill = isHex(primary) ? primary : '#44403c';
    const edge = isHex(secondary) ? secondary : '#e7e5e4';
    return (
        <div data-className="PaletteCoreIcon" className="flex flex-col gap-1">
            <span className="text-xs text-muted">Core icon</span>
            <svg
                width="48"
                height="48"
                viewBox="0 0 64 64"
                aria-label={`${name} core icon`}
                role="img"
            >
                <circle cx="32" cy="32" r="24" fill={fill} stroke={edge} strokeWidth="5" />
                <path d="M32 14 L36 30 L32 28 L28 30 Z" fill={edge} />
                <rect x="24" y="30" width="16" height="3" fill={edge} />
                <rect x="30" y="33" width="4" height="12" fill={darken(fill)} />
            </svg>
        </div>
    );
}

export default function PalettePreview({
    name,
    primary,
    secondary,
    children,
}: {
    name: string;
    primary: PlanPaletteColor;
    secondary: PlanPaletteColor;
    children?: ReactNode;
}) {
    return (
        <div data-className="PalettePreview" className="flex flex-col gap-3 rounded-md border border-border-custom bg-surface-light px-4 py-3">
            <p className="text-sm font-semibold text-white">{name}</p>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                <PaletteTreeBadge name={name} primary={primary.hex} />
                <PaletteChargeResource secondary={secondary.hex} />
                <PaletteCoreIcon name={name} primary={primary.hex} secondary={secondary.hex} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
                <Swatch role="Primary" color={primary} />
                <Swatch role="Secondary" color={secondary} />
            </div>
            {children}
        </div>
    );
}
