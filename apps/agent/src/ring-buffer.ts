/**
 * Fixed-size circular buffer for streaming sample data.
 * Stores the last N items with O(1) push and O(n) iteration.
 */
export class RingBuffer<T> {
  private buf: (T | undefined)[];
  private head = 0;
  private count = 0;

  constructor(private readonly capacity: number) {
    this.buf = new Array(capacity);
  }

  push(item: T): void {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /** Iterate oldest → newest */
  *[Symbol.iterator](): Iterator<T> {
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      yield this.buf[(start + i) % this.capacity] as T;
    }
  }

  /** Get all items oldest → newest */
  toArray(): T[] {
    return [...this];
  }

  /** Get the last N items (newest first) */
  last(n: number): T[] {
    const result: T[] = [];
    const take = Math.min(n, this.count);
    for (let i = 0; i < take; i++) {
      const idx = (this.head - 1 - i + this.capacity) % this.capacity;
      result.push(this.buf[idx] as T);
    }
    return result;
  }

  get size(): number {
    return this.count;
  }

  get full(): boolean {
    return this.count === this.capacity;
  }

  clear(): void {
    this.buf = new Array(this.capacity);
    this.head = 0;
    this.count = 0;
  }

  /** Drain and return all buffered items, then clear */
  drain(): T[] {
    const items = this.toArray();
    this.clear();
    return items;
  }
}
