import type { Metadata } from "next";
import AriaChatWidget from "@/components/widget/AriaChatWidget";
import "./widget.css";

/* Standalone chat page loaded inside the iframe injected by /widget.js
   on the client's website. Not meant to be browsed or indexed directly. */

export const metadata: Metadata = {
  title: "Aria — City Law College",
  robots: { index: false, follow: false },
};

export default function WidgetPage() {
  return <AriaChatWidget />;
}
