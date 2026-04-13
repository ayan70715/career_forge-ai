import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import { ThemeProvider } from "@/components/shared/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CareerForge AI - Smart Resume Builder",
  description: "AI-powered resume builder, ATS checker, CV generator, and interview preparation tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <div className="relative flex min-h-screen flex-col">
            {/* Dot grid background */}
            <div className="dot-grid-bg fixed inset-0 pointer-events-none z-0" />
            {/* Radial glow spotlight at top */}
            <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] pointer-events-none z-0 opacity-60"
              style={{
                background: "radial-gradient(ellipse at center top, rgba(139,92,246,0.08), transparent 70%)",
              }}
            />
            <Navbar />
            <main className="relative z-10 flex-1">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
