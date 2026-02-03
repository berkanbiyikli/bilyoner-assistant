import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/lib/query/providers";
import { ThemeProvider } from "next-themes";
import { ThemeToggle } from "@/components/theme-toggle";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#22c55e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "Bilyoner Assistant - İddaa Analiz",
  description: "Canlı maç analizi ve akıllı kupon önerileri",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Bilyoner Assistant",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <div className="min-h-screen bg-background">
              {/* Header */}
              <header className="sticky top-0 z-50 border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-sm">
                <div className="container flex h-16 items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-2 rounded-xl shadow-lg">
                      <span className="text-2xl">⚽</span>
                    </div>
                    <div>
                      <h1 className="font-bold text-xl bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                        Bilyoner Assistant
                      </h1>
                      <p className="text-xs text-muted-foreground">Akıllı Bahis Asistanı</p>
                    </div>
                  </div>
                  <nav className="flex items-center gap-2">
                    <a href="/" className="px-4 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-md hover:shadow-lg transition-all">
                      ⚽ Top 20 Lig Maçları
                    </a>
                    <ThemeToggle variant="dropdown" />
                  </nav>
                </div>
              </header>

              {/* Main Content */}
              <main className="container py-6">
                {children}
              </main>
            </div>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
