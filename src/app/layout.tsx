import type { Metadata } from "next";
// letras servidas pela própria app: nenhum pedido a terceiros
import "@fontsource/archivo/400.css";
import "@fontsource/archivo/500.css";
import "@fontsource/archivo/600.css";
import "@fontsource/archivo/700.css";
import "@fontsource/bricolage-grotesque/800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Controlo N5",
  description: "Comunidades, pipeline, campanhas e receita dos softwares N5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
