import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import BottomNav from "./components/BottomNav";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Outreach App",
  description: "Gemeinsam lokale Outreach-Aktionen organisieren",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground pb-16">
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
