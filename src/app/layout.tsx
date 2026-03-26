import type { Metadata } from 'next';
import { EB_Garamond, Noto_Serif_SC } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/layout/AppShell';
import { Analytics } from '@vercel/analytics/next';

const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  variable: '--font-garamond',
  display: 'swap',
});

const notoSerifSC = Noto_Serif_SC({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-noto-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Claude',
  description: 'Claude by Anthropic',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html data-theme="claude" data-mode="light" lang="zh-CN" className={`h-full antialiased ${ebGaramond.variable} ${notoSerifSC.variable}`}>
      <body className="h-full">
        <AppShell>
          {children}
        </AppShell>
        <Analytics />
      </body>
    </html>
  );
}
