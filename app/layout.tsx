import type { Metadata } from 'next';
import { Suspense } from 'react';
import NavigationProgress from '@/components/providers/NavigationProgress';
import { SessionProvider } from '@/components/providers/SessionProvider';
import QueryProvider from '@/components/providers/QueryProvider';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Master Agency Operations CRM',
  description: 'Enterprise Multi-Tenant WhatsApp & Meta Tech Provider Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('color-theme');
                  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning className="antialiased selection:bg-cyan-500/20 selection:text-cyan-600 dark:selection:text-cyan-200">
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <SessionProvider>
          <QueryProvider>
            {children}
          </QueryProvider>
        </SessionProvider>
        {/* Global Sonner Toast Notifications */}
        <Toaster position="bottom-right" theme="dark" richColors closeButton duration={4000} />
      </body>
    </html>
  );
}
