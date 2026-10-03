/**
 * BinaryHeap - Binary min-heap for A* with allocation-free operations.
 *
 * Stores cell indices with keys in an external Int32Array.
 * Ties are broken by cell index (lowest first by default; see setTieOrder).
 * All operations (push, pop, update) are O(log n) with no allocations.
 */

export class BinaryHeap {
    private heap: Int32Array;
    private size: number = 0;
    private keys: Int32Array;
    private positions: Int32Array; // maps cell index -> heap position; -1 if not in heap
    /** 1 = equal keys pop lowest cell index first; -1 = highest first (mirrored searches). */
    private tieSign: 1 | -1 = 1;

    constructor(capacity: number, keys: Int32Array) {
        this.heap = new Int32Array(capacity);
        this.keys = keys;
        this.positions = new Int32Array(capacity);
        this.positions.fill(-1);
    }

    /** Choose which way equal keys are ordered. Only call while the heap is empty. */
    setTieOrder(descending: boolean): void {
        this.tieSign = descending ? -1 : 1;
    }

    /**
     * Clear the heap. O(size), not O(capacity).
     */
    clear(): void {
        for (let i = 0; i < this.size; i++) {
            const cell = this.heap[i];
            this.positions[cell] = -1;
        }
        this.size = 0;
    }

    /**
     * Push a cell onto the heap. O(log n).
     */
    push(cell: number): void {
        if (this.positions[cell] !== -1) {
            return; // Already in heap.
        }

        this.heap[this.size] = cell;
        this.positions[cell] = this.size;
        this.siftUp(this.size);
        this.size++;
    }

    /**
     * Pop the cell with the smallest key. O(log n).
     * Ties are broken by lower cell index.
     */
    pop(): number {
        if (this.size === 0) {
            return -1;
        }

        const min = this.heap[0];
        this.positions[min] = -1;

        this.size--;
        if (this.size > 0) {
            this.heap[0] = this.heap[this.size];
            this.positions[this.heap[0]] = 0;
            this.siftDown(0);
        }

        return min;
    }

    /**
     * Update a cell (re-sift after its key decreased). O(log n).
     */
    update(cell: number): void {
        const pos = this.positions[cell];
        if (pos === -1) {
            return; // Not in heap.
        }
        this.siftUp(pos);
    }

    /**
     * Check if a cell is in the heap.
     */
    has(cell: number): boolean {
        return this.positions[cell] !== -1;
    }

    private siftUp(pos: number): void {
        const cell = this.heap[pos];
        const key = this.keys[cell];

        while (pos > 0) {
            const parentPos = (pos - 1) >> 1;
            const parentCell = this.heap[parentPos];
            const parentKey = this.keys[parentCell];

            if (
                parentKey < key ||
                (parentKey === key && (parentCell - cell) * this.tieSign < 0)
            ) {
                break;
            }

            this.heap[pos] = parentCell;
            this.positions[parentCell] = pos;
            pos = parentPos;
        }

        this.heap[pos] = cell;
        this.positions[cell] = pos;
    }

    private siftDown(pos: number): void {
        const cell = this.heap[pos];
        const key = this.keys[cell];
        const half = this.size >> 1;

        while (pos < half) {
            let childPos = (pos << 1) + 1;
            let childCell = this.heap[childPos];
            let childKey = this.keys[childCell];

            const rightPos = childPos + 1;
            if (rightPos < this.size) {
                const rightCell = this.heap[rightPos];
                const rightKey = this.keys[rightCell];

                if (
                    rightKey < childKey ||
                    (rightKey === childKey && (rightCell - childCell) * this.tieSign < 0)
                ) {
                    childPos = rightPos;
                    childCell = rightCell;
                    childKey = rightKey;
                }
            }

            if (
                key < childKey ||
                (key === childKey && (cell - childCell) * this.tieSign < 0)
            ) {
                break;
            }

            this.heap[pos] = childCell;
            this.positions[childCell] = pos;
            pos = childPos;
        }

        this.heap[pos] = cell;
        this.positions[cell] = pos;
    }
}
