import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Noto_Sans_Devanagari } from "next/font/google";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const deva = Noto_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "500", "600", "700"], variable: "--font-deva", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-jb", display: "swap" });

export const metadata: Metadata = {
  title: { default: "TOLPRAMAN · NAWI Test Reports", template: "%s · TOLPRAMAN" },
  description: "Compliance and digital reporting platform for type evaluation of non-automatic weighing instruments as per OIML R 76 and Legal Metrology (General) Rules, 2011.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#034597", width: "device-width", initialScale: 1 };

const themeScript = `try{var t=localStorage.getItem('tp-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${deva.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans">
        <AuthProvider>{children}</AuthProvider>
        <Toaster position="top-right" richColors closeButton toastOptions={{ className: "font-sans" }} />
      </body>
    </html>
  );
}
