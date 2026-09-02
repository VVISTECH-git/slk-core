import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";

import { Sidebar } from "@/components/sidebar";
import { currentActor } from "@/lib/session";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono-face",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sree Lakshmi Kalamkari",
  description: "Stock, catalogue and channels",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  /*
    Read here so the shell knows who it belongs to.

    It is not the guard — every page calls `requirePage` and every action
    `requireActor`, because a layout deciding what to render is a decision
    about chrome and a Server Action is a POST that never renders one. This
    only picks which shell: signed in gets the sidebar, signed out gets the
    bare page, which is what /login wants.
  */
  const who = await currentActor();

  return (
    <html
      lang="en"
      className={`${inter.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="font-sans min-h-full">
        {who === null ? (
          children
        ) : (
          <div className="flex min-h-screen">
            <Sidebar
              actor={{ name: who.name, code: who.code, role: who.role }}
            />
            <main className="min-w-0 flex-1">{children}</main>
          </div>
        )}
      </body>
    </html>
  );
}
