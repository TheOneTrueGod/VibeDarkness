/**
 * Compare two serialized game state snapshots and return paths of differing fields.
 */
export function diffSnapshotFields(
    client: Record<string, unknown>,
    server: Record<string, unknown>,
    path = '',
): string[] {
    const diffs: string[] = [];
    const allKeys = new Set([...Object.keys(client), ...Object.keys(server)]);

    for (const key of allKeys) {
        const p = path ? `${path}.${key}` : key;
        const cv = client[key];
        const sv = server[key];

        if (cv === undefined && sv === undefined) continue;
        if (cv === undefined || sv === undefined) {
            diffs.push(p);
            continue;
        }

        const cType = Array.isArray(cv) ? 'array' : typeof cv;
        const sType = Array.isArray(sv) ? 'array' : typeof sv;

        if (cType !== sType) {
            diffs.push(p);
            continue;
        }

        if (cType === 'object' && cv !== null && sv !== null) {
            if (Array.isArray(cv) && Array.isArray(sv)) {
                const maxLen = Math.max(cv.length, sv.length);
                for (let i = 0; i < maxLen; i++) {
                    const cp = cv[i];
                    const sp = sv[i];
                    if (i >= cv.length || i >= sv.length) {
                        diffs.push(`${p}[${i}]`);
                    } else if (
                        cp !== null &&
                        typeof cp === 'object' &&
                        sp !== null &&
                        typeof sp === 'object' &&
                        !Array.isArray(cp) &&
                        !Array.isArray(sp)
                    ) {
                        diffs.push(...diffSnapshotFields(cp as Record<string, unknown>, sp as Record<string, unknown>, `${p}[${i}]`));
                    } else if (JSON.stringify(cp) !== JSON.stringify(sp)) {
                        diffs.push(`${p}[${i}]`);
                    }
                }
            } else if (!Array.isArray(cv) && !Array.isArray(sv)) {
                diffs.push(...diffSnapshotFields(cv as Record<string, unknown>, sv as Record<string, unknown>, p));
            } else {
                diffs.push(p);
            }
        } else if (typeof cv === 'number' && typeof sv === 'number') {
            if (Number.isNaN(cv) !== Number.isNaN(sv) || (!Number.isNaN(cv) && Math.abs(cv - sv) > 1e-9)) {
                diffs.push(p);
            }
        } else if (JSON.stringify(cv) !== JSON.stringify(sv)) {
            diffs.push(p);
        }
    }

    return diffs;
}
