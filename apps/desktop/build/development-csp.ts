import type { Plugin } from 'vite';
export function developmentCsp(): Plugin {
  return {
    name: 'forge-development-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
        .replace("connect-src 'self'", "connect-src 'self' ws://localhost:* ws://127.0.0.1:*");
    },
  };
}
