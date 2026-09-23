import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Tooltip from '@radix-ui/react-tooltip';
import { App } from './app/App';
import '@fontsource-variable/inter';
import '@fontsource-variable/inter/wght-italic.css';
import '@fontsource-variable/noto-sans-sc';
import './styles/globals.css';
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15000, refetchOnWindowFocus: true } },
});
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Tooltip.Provider delayDuration={400}>
          <App />
        </Tooltip.Provider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
