import { createServer, type Socket } from 'node:net';
import { chmod, lstat, unlink } from 'node:fs/promises';
import { z } from 'zod';
const requestSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string().max(128), z.number().int()]),
    protocolVersion: z.literal(1),
    method: z.literal('health'),
  })
  .strict();
export async function startLocalServer(path: string): Promise<{ close(): Promise<void> }> {
  // Main's single-instance lock must be held before calling this function.
  try {
    const old = await lstat(path);
    if (!old.isSocket() || old.uid !== process.getuid?.())
      throw new Error('Socket path is not an owned socket');
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    socket.setTimeout(10000, () => socket.destroy());
    let buffer = Buffer.alloc(0);
    let handled = false;
    socket.on('data', (chunk) => {
      if (handled) return;
      buffer = Buffer.concat([buffer, typeof chunk === 'string' ? Buffer.from(chunk) : chunk]);
      if (buffer.length > 65536) {
        socket.destroy();
        return;
      }
      const newline = buffer.indexOf(10);
      if (newline < 0) return;
      handled = true;
      void (async () => {
        let raw: unknown;
        try {
          raw = JSON.parse(buffer.subarray(0, newline).toString('utf8'));
        } catch {
          socket.end(
            JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }) +
              '\n',
          );
          return;
        }
        const parsed = requestSchema.safeParse(raw);
        if (!parsed.success) {
          socket.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: { code: -32601, message: 'Only protocol v1 health queries are available' },
            }) + '\n',
          );
          return;
        }
        const { id } = parsed.data;
        try {
          const result = { protocolVersion: 1, status: 'ready' };
          socket.end(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
        } catch {
          socket.end(
            JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message: 'Core unavailable' } }) +
              '\n',
          );
        }
      })();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(path, resolve);
  });
  await chmod(path, 0o600);
  return {
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
