import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from 'react'; // Import Suspense
import "./globals.css";
import { WebSocketProvider } from '@/context/WebSocketContext';
import { Toaster } from 'react-hot-toast';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Assume NEXT_PUBLIC_APP_URL is set in your environment variables (e.g., .env.local)
// Replace with your actual deployed app URL and image/API paths
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'; // Default for local dev
const frameImageUrl = `${appUrl}/og-image.png`; // Example image URL
const framePostUrl = `${appUrl}/api/frame`; // Example frame action API endpoint

export const metadata: Metadata = {
  title: "Farcaster Chess", // Updated title
  description: "Play chess directly within Farcaster!", // Updated description
  // Add other standard metadata tags as needed (e.g., icons, open graph)
  other: {
    // --- Farcaster Frame Meta Tags ---
    // Required tags
    'fc:frame': 'vNext',
    'fc:frame:image': frameImageUrl,
    'fc:frame:post_url': framePostUrl,

    // Optional tags (examples)
    'fc:frame:button:1': 'Play Now',
    // 'fc:frame:button:2': 'View Leaderboard',
    // 'fc:frame:input:text': 'Enter your move (e.g., e2e4)',

    // --- Open Graph Meta Tags (Recommended for better sharing previews) ---
    'og:title': 'Farcaster Chess',
    'og:description': 'Play chess directly within Farcaster!',
    'og:image': frameImageUrl,
    // Add other OG tags like og:url, og:type etc.
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <WebSocketProvider>
          <Suspense fallback={<div>Loading...</div>}> {/* Wrap children in Suspense */}
            {children}
          </Suspense>
          <Toaster position="top-right" />
        </WebSocketProvider>
      </body>
    </html>
  );
}
