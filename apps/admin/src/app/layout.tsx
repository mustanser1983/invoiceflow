import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Invoiceflow Admin',
  description: 'Invoiceflow platform administration',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
