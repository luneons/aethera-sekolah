'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';
import { Toaster } from 'sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      themes={['dark', 'light']}
      // disableTransitionOnChange supaya animasi custom kita yang ambil alih.
      disableTransitionOnChange
    >
      <QueryClientProvider client={client}>
        {children}
        <Toaster
          position="top-center"
          richColors
          closeButton
          duration={2500}
          gap={8}
          visibleToasts={3}
          toastOptions={{
            classNames: {
              toast: 'group toast-aethera',
              closeButton:
                '!bg-surface-raised !border-surface-border !text-text-muted hover:!text-text-primary',
            },
          }}
        />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
