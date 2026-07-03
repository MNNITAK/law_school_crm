import type { Metadata, Viewport } from "next";
import "./site.css";

export const metadata: Metadata = {
  title:
    "City Law College, Lucknow — BA LL.B (Hons.) & LL.B | University of Lucknow (Code 1238)",
  description:
    "City Law College, Lucknow — affiliated to the University of Lucknow (College Code 1238). 5-year BA LL.B (Hons.) and 3-year LL.B. Moot courts, legal-aid clinic, and Aria — your 24/7 AI admissions counsellor.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
