import { expect, it } from 'vitest';
import { CodexRpc } from '../../packages/adapters/src/codex-rpc';
const fixture = `const r=require('readline').createInterface({input:process.stdin}); r.on('line',l=>{const m=JSON.parse(l); if(m.method==='exit')process.exit(0); if(m.method==='bad')return console.log('bad'); if(m.method==='wait')return; if(m.method==='approve'){console.log(JSON.stringify({id:'server',method:'approval',params:{}}));return;} console.log(JSON.stringify({method:'notice',params:{}})); console.log(JSON.stringify({id:m.id,result:m.params}));});`;
const open = () =>
  new CodexRpc(process.execPath, ['-e', fixture], { ...process.env, ELECTRON_RUN_AS_NODE: '1' });
it('correlates concurrent requests and notifications, denies unhandled approvals', async () => {
  const rpc = open();
  const notices: string[] = [];
  rpc.onNotification = (m) => notices.push(m);
  try {
    expect(await Promise.all([rpc.request('echo', { a: 1 }), rpc.request('echo', { a: 2 })])).toEqual([
      { a: 1 },
      { a: 2 },
    ]);
    expect(notices).toEqual(['notice', 'notice']);
    await expect(rpc.request('wait', {}, 30)).rejects.toThrow('timeout');
  } finally {
    await rpc.close();
  }
});
it('rejects malformed frames and child exit and cancels pending requests on close', async () => {
  for (const method of ['bad', 'exit']) {
    const rpc = open();
    await expect(rpc.request(method, {})).rejects.toThrow();
    await rpc.close();
  }
  const rpc = open();
  const pending = rpc.request('wait', {});
  const rejected = expect(pending).rejects.toThrow();
  await rpc.close();
  await rejected;
});
