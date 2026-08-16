import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Streetwise — Check a landlord and block before you sign",
  description:
    "Search any NYC address for a Building Health Score and Block Quality Score built from public 311 complaint data.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapsScriptSrc = mapsApiKey
    ? `https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}&libraries=maps,marker,places`
    : null;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>{mapsScriptSrc && <script async src={mapsScriptSrc} />}</head>
      <body className="min-h-full flex flex-col bg-[color:var(--background)] text-[color:var(--foreground)]">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
