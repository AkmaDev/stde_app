"use client";

import { useEffect, useState } from "react";
import { PhotoFacade } from "@/lib/api";

// Vue de rue du bâtiment via Mapillary (imagerie communautaire libre, gratuite,
// sans carte bancaire — remplace l'intégration Google Street View initialement
// prévue, incompatible avec la contrainte budget). Recherche l'image la plus
// proche des coordonnées du bâtiment dans une petite boîte (~50 m). Aucun appel
// si le token n'est pas configuré ou si les coordonnées sont absentes.
//
// Quand de vraies photos de façade ont été identifiées pour un bâtiment
// (batiment.photos_facade, source citée et vérifiée — voir ex. Hélène Berr),
// elles remplacent entièrement Mapillary : image communautaire non pertinente
// au mieux, pas forcément la bonne façade au pire.
const DELTA = 0.0005; // ~50 m à la latitude de Paris

export default function StreetView({
  latitude,
  longitude,
  photos,
}: {
  latitude: number | null;
  longitude: number | null;
  photos: PhotoFacade[];
}) {
  const token = process.env.NEXT_PUBLIC_MAPILLARY_TOKEN;
  const [status, setStatus] = useState<"loading" | "found" | "empty" | "error">("loading");
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (photos.length > 0 || !token || latitude == null || longitude == null) return;
    setStatus("loading");
    const bbox = [longitude - DELTA, latitude - DELTA, longitude + DELTA, latitude + DELTA].join(",");
    const url = `https://graph.mapillary.com/images?access_token=${token}&fields=thumb_2048_url&bbox=${bbox}&limit=1`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        const first = data?.data?.[0];
        if (first?.thumb_2048_url) {
          setImageUrl(first.thumb_2048_url);
          setStatus("found");
        } else {
          setStatus("empty");
        }
      })
      .catch(() => setStatus("error"));
  }, [token, latitude, longitude]);

  // Lien gratuit (aucune clé, aucune facturation) vers l'interface web Google
  // Maps en mode Street View — sert uniquement de démo externe pour montrer à
  // Jean la qualité qu'offrirait l'intégration payante, sans l'acheter.
  const googleStreetViewLink =
    latitude != null && longitude != null
      ? `https://maps.google.com/maps?q=&layer=c&cbll=${latitude},${longitude}&cbp=11,0,0,0,0`
      : null;

  const Head = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 600 }}>
      <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#161616" }}>Vue de rue</h2>
      <p style={{ margin: 0, fontSize: 16 }}>Photographie de la façade principale, côté rue.</p>
    </div>
  );

  const fallback = (message: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <Head />
      <div style={{ background: "#f6f6f6", padding: 24, fontSize: 15, display: "flex", flexDirection: "column", gap: 8, maxWidth: 720 }}>
        <span style={{ color: "#161616", fontWeight: 500 }}>Vue de rue indisponible</span>
        <span>{message}</span>
        {googleStreetViewLink && (
          <a href={googleStreetViewLink} target="_blank" rel="noreferrer" style={{ color: "#000091" }}>
            Ouvrir dans Google Street View ↗
          </a>
        )}
      </div>
    </div>
  );

  if (photos.length > 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        <Head />
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {photos.map((p) => (
            <div key={p.url} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <img
                src={p.url}
                alt={p.legende}
                style={{ width: "100%", height: "auto", maxHeight: "80vh", display: "block", background: "#f6f6f6" }}
              />
              <span style={{ fontSize: 14, color: "#666" }}>
                {p.legende} — Photo :{" "}
                <a href={p.credit_url} target="_blank" rel="noreferrer" style={{ color: "#000091" }}>
                  {p.credit_label} ↗
                </a>
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!token) return fallback("Le service d'imagerie Mapillary n'est pas encore configuré pour la plateforme.");
  if (latitude == null || longitude == null) return fallback("Coordonnées non disponibles pour ce bâtiment.");
  if (status === "loading") return fallback("Recherche d'une image à proximité…");
  if (status === "error") return fallback("Erreur lors de la recherche d'image Mapillary.");
  if (status === "empty") return fallback("Aucune image Mapillary disponible à proximité de ce bâtiment.");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <Head />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <img
          src={imageUrl ?? undefined}
          alt="Vue de rue (Mapillary) à proximité du bâtiment"
          style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block", background: "#f6f6f6" }}
        />
        <span style={{ fontSize: 14, color: "#666" }}>
          Image : Mapillary.{" "}
          <a href={`https://www.mapillary.com/app/?lat=${latitude}&lng=${longitude}&z=17`} target="_blank" rel="noreferrer" style={{ color: "#000091" }}>
            Voir en interactif ↗
          </a>
          {googleStreetViewLink && (
            <>
              {" · "}
              <a href={googleStreetViewLink} target="_blank" rel="noreferrer" style={{ color: "#000091" }}>
                Ouvrir dans Google Street View ↗
              </a>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
