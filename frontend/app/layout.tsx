import "./globals.css";
import Shell from "@/components/Shell";
import { getBatiments } from "@/lib/api";

export const metadata = {
  title: "SDTE — Système de traitement des données énergétiques",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const buildings = await getBatiments();

  return (
    <html lang="fr">
      <body>
        <Shell buildings={buildings}>{children}</Shell>
      </body>
    </html>
  );
}
