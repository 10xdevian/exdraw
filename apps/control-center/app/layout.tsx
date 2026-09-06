import type { Metadata } from "next";
import "./globals.css";
import { SidebarNav } from "./nav";

export const metadata: Metadata = {
  title: "Excaldraw — Engineering Control Center",
  description: "Live production dashboard for the Excaldraw real-time collaborative canvas platform.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <SidebarNav />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
