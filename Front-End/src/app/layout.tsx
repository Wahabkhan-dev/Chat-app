
import type {Metadata} from 'next';
import './globals.css';
import { AppProvider } from '@/context/AppContext';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SessionExpiryWarning } from '@/components/SessionExpiryWarning';
import { PwaInit } from '@/components/PwaInit';
// ⚠️ TESTING ONLY — remove ErudaInit import and usage before final release
import { ErudaInit } from '@/components/ErudaInit';

export const metadata: Metadata = {
  title: 'Mawby Teams Chat | Internal Communication',
  description: 'Enterprise internal chat application for Mawby Technologies.',
  icons: {
    icon: '/fav-1.webp',
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.Node;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
<link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@500;600;700&display=swap" rel="stylesheet" />
        <link rel="icon" href="/fav-1.webp" type="image/webp" />
        <link rel="shortcut icon" href="/fav-1.webp" />
        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#fb6a2c" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Mawby Teams" />
        <link rel="apple-touch-icon" href="/icon-192.svg" />
      </head>
      <body className="font-body antialiased bg-background overflow-hidden h-full w-full">
        <AppProvider>
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster />
            <SessionExpiryWarning />
            <PwaInit />
            <ErudaInit />
          </TooltipProvider>
        </AppProvider>
      </body>
    </html>
  );
}
