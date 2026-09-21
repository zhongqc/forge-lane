import { createApp } from './app.js';
import { installShell } from './modules/shell/shell.js';
const app = await createApp();
installShell(app);
await app.init();
await app.listen(Number(process.env.PORT ?? 3001), process.env.HOST ?? '127.0.0.1');
console.log(`Forge Lane API: http://localhost:${process.env.PORT ?? 3001}`);
