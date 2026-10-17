"use client";

// Boussole statique -- la carte (Leaflet) ne tourne jamais ici (pas de contrôle
// de rotation/bearing configuré), le Nord est donc toujours en haut. Un simple
// repère visuel suffit, pas besoin de suivre une orientation dynamique.
export default function Compass({
  style,
}: {
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        position: "absolute",
        zIndex: 1000,
        background: "rgba(255,255,255,0.95)",
        border: "1px solid #DCE5E9",
        borderRadius: "50%",
        width: 56,
        height: 56,
        boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
      title="Nord en haut -- la carte ne pivote pas"
    >
      <svg width="40" height="40" viewBox="0 0 40 40">
        <line x1="20" y1="6" x2="20" y2="34" stroke="#DCE5E9" strokeWidth="1.5" />
        <line x1="6" y1="20" x2="34" y2="20" stroke="#DCE5E9" strokeWidth="1.5" />
        {/* Aiguille Nord, mise en évidence */}
        <polygon points="20,4 24,20 20,17 16,20" fill="#C0503F" />
        <polygon points="20,36 24,20 20,23 16,20" fill="#B7C4CA" />
        <text x="20" y="15" textAnchor="middle" fontSize="9" fontWeight="700" fill="#000091">N</text>
        <text x="20" y="33" textAnchor="middle" fontSize="7" fill="#5B6472">S</text>
        <text x="8" y="23" textAnchor="middle" fontSize="7" fill="#5B6472">O</text>
        <text x="32" y="23" textAnchor="middle" fontSize="7" fill="#5B6472">E</text>
      </svg>
    </div>
  );
}
