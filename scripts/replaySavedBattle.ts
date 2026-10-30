/**
 * Play a saved battle forward, with extra orders queued at future ticks.
 *
 *   npm run replay-battle -- --lobby <CODE> --tick <N> --until <tick> [--orders <file>] [--player <id>]
 *   npm run replay-battle -- --snapshot <path> --mission <missionId> --until <tick> [--orders <file>] [--player <id>]
 *
 * `--orders` is a JSON array of `{ atTick, order }` or JSONL in the applied_orders shape
 * (`{ atTick, order }`). Omit it to play only the orders already in the save.
 *
 * `--trace-every` records every Nth tick (default 1). The run releases order pauses so
 * `endTurn` does not freeze the sim, and stops if a tick does not advance.
 */

import fs from 'fs';
import path from 'path';
import { loadSavedBattle } from '../app/js/games/minion_battles/game/debug/loadSavedBattle';
import { playForward, type ReplayOrder } from '../app/js/games/minion_battles/game/debug/replayPlayForward';

const args = process.argv.slice(2);

function getArg(flag: string): string | null {
    const index = args.indexOf(flag);
    return index !== -1 && index + 1 < args.length ? args[index + 1]! : null;
}

const lobby = getArg('--lobby');
const snapshotPath = getArg('--snapshot');
const missionArg = getArg('--mission');
const tickArg = getArg('--tick');
const untilArg = getArg('--until');
const ordersPath = getArg('--orders');
const playerId = getArg('--player') ?? '1';
const traceEvery = parseInt(getArg('--trace-every') ?? '1', 10);
const untilTick = parseInt(untilArg ?? '', 10);

if ((!lobby && !snapshotPath) || !Number.isFinite(untilTick)) {
    console.error('Usage: npm run replay-battle -- (--lobby <CODE> --tick <N> | --snapshot <path> --mission <id>) --until <tick> [--orders <file>] [--player <id>] [--trace-every <N>]');
    process.exit(1);
}

function missionIdFromLobby(lobbyDir: string): string {
    const gameFile = fs.readdirSync(lobbyDir).find((name) => name.startsWith('game_') && name.endsWith('.json'));
    if (!gameFile) throw new Error(`No game_*.json in ${lobbyDir}`);
    const game = JSON.parse(fs.readFileSync(path.join(lobbyDir, gameFile), 'utf8')) as { selectedMissionId?: string };
    if (!game.selectedMissionId) throw new Error(`${gameFile} has no selectedMissionId`);
    return game.selectedMissionId;
}

function readOrders(filePath: string): ReplayOrder[] {
    const text = fs.readFileSync(filePath, 'utf8');
    const rows = filePath.endsWith('.jsonl')
        ? text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0).map((line) => JSON.parse(line) as unknown)
        : JSON.parse(text) as unknown;
    if (!Array.isArray(rows)) throw new Error(`Orders file must be an array: ${filePath}`);
    return rows.map((row) => {
        if (!row || typeof row !== 'object') throw new Error('Order row is not an object');
        const record = row as { atTick?: unknown; order?: unknown };
        if (typeof record.atTick !== 'number' || !record.order || typeof record.order !== 'object') {
            throw new Error('Each order row needs atTick and order');
        }
        return { atTick: record.atTick, order: record.order as ReplayOrder['order'] };
    });
}

const lobbyDir = lobby ? path.join('storage', 'lobbies', lobby) : null;
const savedPath = snapshotPath
    ?? (lobbyDir && tickArg ? path.join(lobbyDir, 'snapshots', `${tickArg}.json`) : null);
if (!savedPath) {
    console.error('--lobby requires --tick <N> (the snapshot file)');
    process.exit(1);
}
const missionId = missionArg ?? (lobbyDir ? missionIdFromLobby(lobbyDir) : null);
if (!missionId) {
    console.error('--snapshot requires --mission <missionId>');
    process.exit(1);
}

const saved = JSON.parse(fs.readFileSync(savedPath, 'utf8')) as unknown;
const orders = ordersPath ? readOrders(ordersPath) : [];
const engine = loadSavedBattle({ saved, missionId, localPlayerId: playerId });
const result = playForward(engine, { untilTick, orders, traceEvery });
for (const line of result.traces) {
    console.log(JSON.stringify(line));
}
if (result.stalled) {
    console.error(`stalled at tick ${result.tick}: ${result.stalled}`);
    engine.destroy();
    process.exit(2);
}
console.error(`reached tick ${result.tick}`);
engine.destroy();
