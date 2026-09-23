import { Injectable } from '@nestjs/common';

/** Bounded per-process cache; callers must check membership before reading it. */
@Injectable()
export class AvatarCache {
  private entries = new Map<string, { body: Buffer; expires: number }>();
  private pending = new Map<string, Promise<Buffer>>();
  private bytes = 0;
  private readonly maxBytes = 32 * 1024 * 1024;
  private readonly maxEntries = 256;
  private readonly ttl = 10 * 60 * 1000;

  async get(key: string, load: () => Promise<Buffer>): Promise<Buffer> {
    const cached = this.entries.get(key);
    if (cached && cached.expires > Date.now()) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached.body;
    }
    this.remove(key);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const request = load()
      .then((body) => {
        if (body.length <= this.maxBytes) {
          while (this.entries.size >= this.maxEntries || this.bytes + body.length > this.maxBytes) {
            const oldest = this.entries.keys().next().value;
            if (oldest === undefined) break;
            this.remove(oldest);
          }
          this.entries.set(key, { body, expires: Date.now() + this.ttl });
          this.bytes += body.length;
        }
        return body;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }
  private remove(key: string) {
    const previous = this.entries.get(key);
    if (previous) this.bytes -= previous.body.length;
    this.entries.delete(key);
  }
}
