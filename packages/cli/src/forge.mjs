#!/usr/bin/env node
import { socketPath } from '../../adapters/src/socket-path.mjs';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
const command = process.argv[2] ?? 'health';
if (command !== 'health') {
  console.error('Usage: forge health. Project queries await scoped query capabilities.');
  process.exitCode = 2;
} else {
  const socketAddress =
    process.env.FORGE_SOCKET_PATH ??
    (await socketPath(join(homedir(), 'Library/Application Support/Forge Desktop/desktop-v1')).catch(
      () => '/tmp/forge-not-running.sock',
    ));
  const socket = connect(socketAddress);
  let buffer = '';
  let complete = false;
  socket.setTimeout(10000, () => socket.destroy(new Error('Core request timed out')));
  socket.on('connect', () =>
    socket.write(JSON.stringify({ jsonrpc: '2.0', id: 1, protocolVersion: 1, method: command }) + '\n'),
  );
  socket.on('data', (chunk) => {
    buffer += chunk.toString();
    if (buffer.length > 4 * 1024 * 1024) socket.destroy(new Error('Response too large'));
    if (buffer.includes('\n') && !complete) {
      complete = true;
      try {
        const reply = JSON.parse(buffer.split('\n')[0]);
        if (reply.error) throw new Error(reply.error.message);
        console.log(JSON.stringify(reply.result, null, 2));
      } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
      }
      socket.end();
    }
  });
  socket.on('error', (error) => {
    console.error(`Forge Desktop must be running: ${error.message}`);
    process.exitCode = 1;
  });
  socket.on('close', () => {
    if (!complete) process.exitCode = 1;
  });
}
