import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'CampaignLens', template: '%s · CampaignLens' },
  description: 'Reporting and decision support for digital marketing agencies: import campaign data, see what changed, and prepare a client-ready report.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f5f2ea' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
