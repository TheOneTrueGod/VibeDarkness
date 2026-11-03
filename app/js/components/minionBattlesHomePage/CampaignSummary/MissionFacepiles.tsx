/**
 * SVG overlay for the Campaign Summary map: a row of character portraits above each mission
 * node, each ringed in its player's colour. Hovering a player (list or face) enlarges and
 * highlights every face that player owns.
 */
import type { MissionMapNodeLayout } from '../../../games/minion_battles/ui/components/CharacterEditor/MissionMap/missionMapLayout';
import { CIRCLE_R } from '../../../games/minion_battles/ui/components/CharacterEditor/MissionMap/missionMapHelpers';

export interface SummaryFace {
    accountId: number;
    playerName: string;
    characterName: string;
    picture: string | undefined;
    color: string;
}

const FACE_R = 13;
const FACE_STEP = 20;
/** Gap between the top of the mission circle and the centre of the face row. */
const FACE_ROW_OFFSET = CIRCLE_R + FACE_R + 6;
/** Extra viewBox headroom the facepiles need above the top-most node. */
export const FACEPILE_HEADROOM = FACE_R * 2 + 10;
const MAX_FACES = 6;
const CLIP_ID = 'campaign-summary-face-clip';

interface Props {
    missions: MissionMapNodeLayout[];
    facesByMission: Map<string, SummaryFace[]>;
    hoveredAccountId: number | null;
    onHoverAccount: (accountId: number | null) => void;
}

export default function MissionFacepiles({ missions, facesByMission, hoveredAccountId, onHoverAccount }: Props) {
    return (
        <g>
            <defs>
                <clipPath id={CLIP_ID}>
                    <circle r={FACE_R} />
                </clipPath>
            </defs>
            {missions.map(({ id, pos }) => {
                const faces = facesByMission.get(id) ?? [];
                if (faces.length === 0) return null;
                // Order never changes on hover: reordering would move faces under the cursor and flicker.
                const ordered = faces;
                const shown = ordered.length > MAX_FACES ? ordered.slice(0, MAX_FACES - 1) : ordered;
                const overflow = ordered.length - shown.length;
                const count = shown.length + (overflow > 0 ? 1 : 0);
                const startX = pos.x - ((count - 1) * FACE_STEP) / 2;
                const y = pos.y - FACE_ROW_OFFSET;
                const slots = shown.map((face, i) => ({ face, x: startX + i * FACE_STEP }));
                return (
                    <g key={`facepile-${id}`}>
                        {slots.map(({ face, x }) => {
                            const hovered = face.accountId === hoveredAccountId;
                            const dimmed = hoveredAccountId != null && !hovered;
                            return (
                                <g
                                    key={`${id}-${face.accountId}`}
                                    transform={`translate(${x}, ${y})`}
                                    onMouseEnter={() => onHoverAccount(face.accountId)}
                                    onMouseLeave={() => onHoverAccount(null)}
                                    style={{ cursor: 'default' }}
                                >
                                    <title>{`${face.characterName} — ${face.playerName}`}</title>
                                    <g
                                        style={{
                                            transform: `scale(${hovered ? 1.45 : 1})`,
                                            transformOrigin: '0px 0px',
                                            transition: 'transform 0.12s ease, opacity 0.12s ease, filter 0.12s ease',
                                            opacity: dimmed ? 0.45 : 1,
                                            filter: hovered ? `drop-shadow(0 0 6px ${face.color})` : undefined,
                                        }}
                                    >
                                        <circle r={FACE_R} fill="#18181b" />
                                        {face.picture && (
                                            <image
                                                href={face.picture}
                                                x={-FACE_R}
                                                y={-FACE_R}
                                                width={FACE_R * 2}
                                                height={FACE_R * 2}
                                                preserveAspectRatio="xMidYMid slice"
                                                clipPath={`url(#${CLIP_ID})`}
                                            />
                                        )}
                                        <circle r={FACE_R} fill="none" stroke={face.color} strokeWidth={hovered ? 3 : 2.5} />
                                    </g>
                                </g>
                            );
                        })}
                        {overflow > 0 && (
                            <g transform={`translate(${startX + shown.length * FACE_STEP}, ${y})`}>
                                <title>{ordered.slice(shown.length).map((f) => `${f.characterName} — ${f.playerName}`).join('\n')}</title>
                                <circle r={FACE_R} fill="#27272a" stroke="#71717a" strokeWidth={1.5} />
                                <text textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={700} fill="#e4e4e7" style={{ userSelect: 'none' }}>
                                    +{overflow}
                                </text>
                            </g>
                        )}
                    </g>
                );
            })}
        </g>
    );
}
