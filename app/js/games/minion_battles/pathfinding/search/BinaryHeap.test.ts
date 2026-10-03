/**
 * BinaryHeap tests - heap operations, tie-breaking, and randomized stress.
 */

import { describe, it, expect } from 'vitest';
import { BinaryHeap } from './BinaryHeap';

describe('BinaryHeap', () => {
    describe('basic operations', () => {
        it('pops in key order', () => {
            const capacity = 10;
            const keys = new Int32Array(capacity);
            const heap = new BinaryHeap(capacity, keys);

            // Insert some cells with keys.
            keys[0] = 50;
            keys[1] = 10;
            keys[2] = 30;
            keys[3] = 20;
            keys[4] = 40;

            heap.push(0);
            heap.push(1);
            heap.push(2);
            heap.push(3);
            heap.push(4);

            // Pop should return in key order: 1, 3, 2, 4, 0.
            expect(heap.pop()).toBe(1);
            expect(heap.pop()).toBe(3);
            expect(heap.pop()).toBe(2);
            expect(heap.pop()).toBe(4);
            expect(heap.pop()).toBe(0);
            expect(heap.pop()).toBe(-1); // Empty.
        });

        it('ties are broken by lower cell index', () => {
            const capacity = 10;
            const keys = new Int32Array(capacity);
            const heap = new BinaryHeap(capacity, keys);

            // Three cells with the same key.
            keys[5] = 100;
            keys[2] = 100;
            keys[8] = 100;

            heap.push(5);
            heap.push(2);
            heap.push(8);

            // Should pop in order of cell index: 2, 5, 8.
            expect(heap.pop()).toBe(2);
            expect(heap.pop()).toBe(5);
            expect(heap.pop()).toBe(8);
        });

        it('update re-sifts after key decrease', () => {
            const capacity = 10;
            const keys = new Int32Array(capacity);
            const heap = new BinaryHeap(capacity, keys);

            keys[1] = 50;
            keys[2] = 30;
            keys[3] = 20;

            heap.push(1);
            heap.push(2);
            heap.push(3);

            // Decrease key[1] to 5 and update.
            keys[1] = 5;
            heap.update(1);

            // Should pop: 1, 3, 2.
            expect(heap.pop()).toBe(1);
            expect(heap.pop()).toBe(3);
            expect(heap.pop()).toBe(2);
        });
    });

    describe('clear and reuse', () => {
        it('clear resets the heap', () => {
            const capacity = 5;
            const keys = new Int32Array(capacity);
            const heap = new BinaryHeap(capacity, keys);

            keys[0] = 10;
            keys[1] = 20;
            heap.push(0);
            heap.push(1);

            heap.clear();

            // Heap should be empty; push new elements.
            keys[2] = 15;
            heap.push(2);

            expect(heap.pop()).toBe(2);
            expect(heap.pop()).toBe(-1);
        });

        it('reuse across multiple searches', () => {
            const capacity = 5;
            const keys = new Int32Array(capacity);
            const heap = new BinaryHeap(capacity, keys);

            // First search.
            keys[0] = 30;
            keys[1] = 10;
            heap.push(0);
            heap.push(1);

            expect(heap.pop()).toBe(1);
            expect(heap.pop()).toBe(0);

            // Second search on same heap.
            keys[2] = 20;
            keys[3] = 5;
            heap.push(2);
            heap.push(3);

            expect(heap.pop()).toBe(3);
            expect(heap.pop()).toBe(2);
        });
    });

    describe('has() and duplicate prevention', () => {
        it('has() returns true for cells in heap', () => {
            const capacity = 5;
            const keys = new Int32Array(capacity);
            const heap = new BinaryHeap(capacity, keys);

            keys[1] = 10;
            keys[2] = 20;

            heap.push(1);
            expect(heap.has(1)).toBe(true);
            expect(heap.has(2)).toBe(false);

            heap.push(2);
            expect(heap.has(2)).toBe(true);

            heap.pop(); // Removes cell 1.
            expect(heap.has(1)).toBe(false);
        });

        it('duplicate push is ignored', () => {
            const capacity = 5;
            const keys = new Int32Array(capacity);
            const heap = new BinaryHeap(capacity, keys);

            keys[1] = 10;
            heap.push(1);
            heap.push(1); // Should be ignored.

            expect(heap.pop()).toBe(1);
            expect(heap.pop()).toBe(-1); // No duplicate.
        });
    });

    describe('randomized stress test', () => {
        it('compares against sorted array with deterministic LCG', () => {
            // Deterministic LCG for reproducible randomness.
            class LCG {
                private seed: number;
                constructor(seed: number) {
                    this.seed = seed;
                }
                next(): number {
                    // LCG: x_{n+1} = (a * x_n + c) mod m
                    const a = 1664525;
                    const c = 1013904223;
                    this.seed = (a * this.seed + c) >>> 0;
                    return this.seed;
                }
            }

            const rng = new LCG(42);
            const capacity = 500;
            const keys = new Int32Array(capacity);
            const heap = new BinaryHeap(capacity, keys);

            // Generate random keys.
            const elements: { cell: number; key: number }[] = [];
            for (let i = 0; i < 500; i++) {
                const key = rng.next() % 1000;
                keys[i] = key;
                elements.push({ cell: i, key });
            }

            // Push all into heap.
            for (let i = 0; i < 500; i++) {
                heap.push(i);
            }

            // Sort reference array.
            elements.sort((a, b) => {
                if (a.key !== b.key) return a.key - b.key;
                return a.cell - b.cell;
            });

            // Pop from heap and compare.
            for (let i = 0; i < 500; i++) {
                const popped = heap.pop();
                expect(popped).toBe(elements[i].cell);
            }
        });
    });
});
