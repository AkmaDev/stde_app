import { IBM_Plex_Mono, Public_Sans, Spectral } from "next/font/google";
import "./globals.css";
import Shell from "@/components/Shell";
import { getBatiments } from "@/lib/api";

// Police à chiffres tabulaires pour tous les chiffres clés (kWh/m², scores,
// pourcentages) -- cf. classe utilitaire .num dans globals.css.
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-mono" });

// Police de corps -- identité institutionnelle (cf. redesign DSFR), remplace Segoe UI.
const publicSans = Public_Sans({ subsets: ["latin"], weight: ["400", "500", "700", "800"], variable: "--font-sans" });

// Police d'accent italique (sous-titres institutionnels) -- cf. mockup
// "SDTE Plateforme v2.dc.html", chargée en Spectral italique 400 uniquement.
const spectral = Spectral({ subsets: ["latin"], weight: ["400"], style: ["italic"], variable: "--font-serif" });

export const metadata = {
  title: "SDTE — Schéma directeur de transition énergétique",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const buildings = await getBatiments();

  return (
    <html lang="fr" className={`${plexMono.variable} ${publicSans.variable} ${spectral.variable}`}>
      <body>
        <Shell buildings={buildings}>{children}</Shell>
      </body>
    </html>
  );
}
