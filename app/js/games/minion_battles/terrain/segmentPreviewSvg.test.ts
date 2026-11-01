import { describe, expect, it } from 'vitest';
import { TerrainType, TERRAIN_PROPERTIES } from './TerrainType';
import { generateSegmentPreviewSvg, summarizeSegmentTerrain } from './segmentPreviewSvg';

function segmentOf(terrain: TerrainType[][]) {
    return { terrain, width: terrain[0].length, height: terrain.length };
}

function filled(size: number, type: TerrainType): TerrainType[][] {
    return Array.from({ length: size }, () => Array<TerrainType>(size).fill(type));
}

describe('summarizeSegmentTerrain', () => {
    it('keeps a one-cell path when downscaling grass', () => {
        const terrain = filled(48, TerrainType.Grass);
        for (let r = 0; r < 48; r++) terrain[r][21] = TerrainType.Dirt;
        const pixels = summarizeSegmentTerrain(segmentOf(terrain), 24);
        for (const row of pixels) {
            expect(row[10]).toBe(TerrainType.Dirt);
            expect(row[0]).toBe(TerrainType.Grass);
        }
    });

    it('prefers path over water over rock over grass in a shared pixel', () => {
        const pick = (types: TerrainType[]) =>
            summarizeSegmentTerrain(segmentOf([types]), 1)[0][0];
        expect(pick([TerrainType.Grass, TerrainType.Rock])).toBe(TerrainType.Rock);
        expect(pick([TerrainType.Rock, TerrainType.Water])).toBe(TerrainType.Water);
        expect(pick([TerrainType.Water, TerrainType.Dirt])).toBe(TerrainType.Dirt);
        expect(pick([TerrainType.Grass, TerrainType.ThickGrass])).toBe(TerrainType.ThickGrass);
    });

    it('upscales a segment smaller than the preview', () => {
        const pixels = summarizeSegmentTerrain(segmentOf(filled(22, TerrainType.Rock)), 24);
        expect(pixels).toHaveLength(24);
        expect(pixels.every((row) => row.length === 24 && row.every((t) => t === TerrainType.Rock))).toBe(true);
    });
});

describe('generateSegmentPreviewSvg', () => {
    it('draws the most common terrain as one background rect', () => {
        const svg = generateSegmentPreviewSvg(segmentOf(filled(22, TerrainType.Grass)));
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg).toContain('width="24" height="24"');
        expect(svg.match(/<rect/g)).toHaveLength(1);
        expect(svg).toContain(TERRAIN_PROPERTIES[TerrainType.Grass].color);
    });

    it('merges runs of the same terrain into one rect per row', () => {
        const terrain = filled(24, TerrainType.Grass);
        terrain[5] = Array<TerrainType>(24).fill(TerrainType.Water);
        const svg = generateSegmentPreviewSvg(segmentOf(terrain));
        expect(svg).toContain(`<rect x="0" y="5" width="24" height="1" fill="${TERRAIN_PROPERTIES[TerrainType.Water].color}"/>`);
        expect(svg.match(/<rect/g)).toHaveLength(2);
    });
});
