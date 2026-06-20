import React from 'react';
import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '../components/Sidebar';

export const metadata: Metadata = {
  title: 'Lovable Powerkits Admin Dashboard',
  description: 'Licensing, Device Locking and Security Center',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex h-screen bg-[#070b13] overflow-hidden text-slate-100">
        <Sidebar />
        <main className="flex-1 overflow-y-auto min-h-screen">
          {/* Note: Sidebar is 64 (w-64) wide. We wrap children in layout margins. */}
          <div className="min-h-screen">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
