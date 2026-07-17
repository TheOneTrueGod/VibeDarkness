import { Container, Graphics } from 'pixi.js';
import type { GameEngine } from '../../GameEngine';

const Z_MAP_NETWORK_DEBUG = 200;
const EDGE_COLOR = 0xffff00;
const NODE_COLOR = 0xffff00;
/** Floor so a node with `radius` 0 (or near-0) still renders as a visible dot. */
const MIN_NODE_VISUAL_RADIUS = 6;

/**
 * Debug-only visualization of `MapNetworkManager`'s graph: yellow lines for edges, yellow circles
 * for nodes. Draws `node.radius` verbatim (the manager's actual containment radius used by
 * `findNodeContainingPosition`) rather than re-deriving a "nicer" pixel value, so this stays a
 * faithful debug view of what the manager queries actually see.
 */
export class MapNetworkRenderer {
    private container: Container = new Container();
    private graphics: Graphics = new Graphics();

    constructor(private readonly gameContainer: Container) {
        this.container.zIndex = Z_MAP_NETWORK_DEBUG;
        this.container.addChild(this.graphics);
        this.gameContainer.addChild(this.container);
    }

    setLayerVisible(visible: boolean): void {
        this.container.visible = visible;
    }

    render(engine: GameEngine): void {
        this.graphics.clear();
        const mapNetwork = engine.mapNetworkManager;
        const nodeIds = mapNetwork.getAllNodeIds();

        const drawnEdges = new Set<string>();
        for (const nodeId of nodeIds) {
            const node = mapNetwork.getNode(nodeId);
            if (!node) continue;
            for (const neighborId of mapNetwork.getNeighborIds(nodeId)) {
                const edgeKey = [nodeId, neighborId].sort().join('|');
                if (drawnEdges.has(edgeKey)) continue;
                drawnEdges.add(edgeKey);
                const neighbor = mapNetwork.getNode(neighborId);
                if (!neighbor) continue;
                this.graphics.moveTo(node.x, node.y);
                this.graphics.lineTo(neighbor.x, neighbor.y);
                this.graphics.stroke({ color: EDGE_COLOR, width: 2 });
            }
        }

        for (const nodeId of nodeIds) {
            const node = mapNetwork.getNode(nodeId);
            if (!node) continue;
            const visualRadius = Math.max(node.radius, MIN_NODE_VISUAL_RADIUS);
            this.graphics.circle(node.x, node.y, visualRadius);
            this.graphics.stroke({ color: NODE_COLOR, width: 2 });
        }
    }

    destroy(): void {
        this.graphics.destroy();
        this.container.destroy();
    }
}
