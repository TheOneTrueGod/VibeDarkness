/**
 * Resource display (updateResources) with crystal SVG pills
 */

import { getCrystalSvg } from '../utils/svgUtils.js';

const PLAYER_RESOURCES_ID = 'player-resources';

/** Colour for each resource type (used in lobby resource display) */
const RESOURCE_COLORS: Record<string, string> = {
    fire: '#E74C3C',
    water: '#3498DB',
    earth: '#27AE60',
    air: '#9B59B6',
};

export interface ResourceDisplayData {
    fire: number;
    water: number;
    earth: number;
    air: number;
}

const RESOURCE_ORDER: (keyof ResourceDisplayData)[] = ['fire', 'water', 'earth', 'air'];

export class ResourceDisplay {
    updateResources(resources: ResourceDisplayData): void {
        const container = document.getElementById(PLAYER_RESOURCES_ID);
        if (!container) return;
        container.innerHTML = '';
        for (const key of RESOURCE_ORDER) {
            const value = resources[key];
            const span = document.createElement('span');
            span.className = 'resource-pill';
            span.setAttribute('data-resource', key);
            span.style.setProperty('--resource-color', RESOURCE_COLORS[key] ?? '#888');
            span.title = key.charAt(0).toUpperCase() + key.slice(1) + ': ' + value;
            const crystal = document.createElement('span');
            crystal.className = 'resource-crystal';
            crystal.innerHTML = getCrystalSvg();
            span.appendChild(crystal);
            span.appendChild(document.createTextNode(String(value)));
            container.appendChild(span);
        }
    }
}
