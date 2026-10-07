import type { Deployable, DeployableQuery } from './Deployable';

export interface DeployableProvider {
    listDeployables(): Deployable[];
    /** Consume the deployable with this id. Returns whether it was found and consumed. */
    consume(id: string): boolean;
}

export class DeployableRegistry {
    private providers: DeployableProvider[] = [];

    registerProvider(provider: DeployableProvider): void {
        if (!this.providers.includes(provider)) this.providers.push(provider);
    }

    findDeployables(query: DeployableQuery): Deployable[] {
        const { castingTeam, near, halfExtent, radius, tags, includeInactive } = query;
        const out: { d: Deployable; distSq: number }[] = [];
        for (const provider of this.providers) {
            for (const d of provider.listDeployables()) {
                if (!includeInactive && !d.active) continue;
                if (d.teamId === undefined || d.teamId !== castingTeam) continue;
                if (tags && !tags.every((t) => d.tags.includes(t))) continue;
                const dx = d.x - near.x;
                const dy = d.y - near.y;
                if (halfExtent !== undefined && Math.max(Math.abs(dx), Math.abs(dy)) > halfExtent) continue;
                const distSq = dx * dx + dy * dy;
                if (radius !== undefined && distSq > radius * radius) continue;
                out.push({ d, distSq });
            }
        }
        out.sort((a, b) => a.distSq - b.distSq || (a.d.id < b.d.id ? -1 : a.d.id > b.d.id ? 1 : 0));
        return out.map((e) => e.d);
    }

    /** Routes to the provider that lists a deployable with the same kind and id. */
    consumeDeployable(deployable: Pick<Deployable, 'id' | 'kind'>): boolean {
        for (const provider of this.providers) {
            if (provider.listDeployables().some((d) => d.id === deployable.id && d.kind === deployable.kind)) {
                return provider.consume(deployable.id);
            }
        }
        return false;
    }
}
