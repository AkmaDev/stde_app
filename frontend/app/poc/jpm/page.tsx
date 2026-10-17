// Prototype interne, volontairement non lié dans Shell.tsx ni dans aucune
// page de l'app -- accessible seulement par URL directe (/poc/jpm). Démontre
// la chaîne Brique 0 -> Brique 1 -> Brique 3 (BMO) sur le seul bâtiment assez
// documenté pour que l'exercice ait un sens (Jean-Pierre Melville). Jamais
// mélangé au portail de démo : cf. l'échange sur le "bouton" qui donnerait
// une fausse impression de capacité si montré comme une vraie fonctionnalité
// du portail (voir plan joyful-giggling-crystal.md).
import { getBatiment } from "@/lib/api";
import JpmPocClient from "./JpmPocClient";
import qualification from "@/data/poc/jpm_qualification.json";
import resultatBrique3 from "@/data/poc/jpm_resultat_brique3.json";

export default async function PocJpmPage() {
  const { batiment } = await getBatiment(16);

  return (
    <>
      <div className="crumb">Prototype interne</div>
      <div className="h1">
        Chaîne Brique 0 → 1 → 3 (BMO) <small>Démonstration sur un seul bâtiment — pas une fonctionnalité du portail</small>
      </div>
      <div
        style={{
          background: "#FBF0E0",
          border: "1px solid #E8CA8F",
          borderRadius: 7,
          padding: "12px 16px",
          marginBottom: 16,
          fontSize: 12.5,
          color: "#8A5A10",
          lineHeight: 1.5,
        }}
      >
        <b>Page prototype, pas une page de démo.</b> Montre honnêtement ce que la chaîne Brique 0 → Brique 1 → Brique 3 du
        document BMO donne concrètement sur le seul bâtiment du parc assez documenté pour que le calcul ait un sens
        (Jean-Pierre Melville). N'est reliée à aucun lien de navigation du portail — volontairement, pour ne pas laisser
        croire que cette capacité existe pour les 165 bâtiments du parc ou pour les 5 flux attendus par la Brique 3 (ici
        seuls 2 sur 5 — solaire et transmission — sont calculés).
      </div>

      <JpmPocClient batiment={batiment} qualification={qualification as any} resultat={resultatBrique3 as any} />
    </>
  );
}
