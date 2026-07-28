from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.database import get_session
from app.models import Batiment, CoupleBatimentLevier, EtatCouple
from app.scoring import OBJECTIF_2030_KWH_M2, ecreter_gains_combines

router = APIRouter(prefix="/indicateurs", tags=["indicateurs"])


@router.get("")
def indicateurs_globaux(session: Session = Depends(get_session)):
    batiments = session.exec(select(Batiment)).all()
    documentes = [b for b in batiments if b.conso_mesuree_kwh_m2 is not None]

    surfaces_totales = sum(b.surface_m2 or 0 for b in documentes)
    if surfaces_totales:
        conso_moyenne_ponderee = sum(
            (b.conso_mesuree_kwh_m2 * (b.surface_m2 or 0)) for b in documentes
        ) / surfaces_totales
    else:
        conso_moyenne_ponderee = 0.0

    ecart_moyen_pct = sum(
        (b.conso_mesuree_kwh_m2 - OBJECTIF_2030_KWH_M2) / OBJECTIF_2030_KWH_M2 * 100
        for b in documentes
    ) / len(documentes) if documentes else 0.0

    couples = session.exec(select(CoupleBatimentLevier)).all()
    gains_par_batiment: dict[int, list[float]] = {}
    nb_leviers_par_batiment: dict[int, int] = {}
    for couple in couples:
        if couple.etat == EtatCouple.applicable and couple.gain_indicatif_pct:
            gains_par_batiment.setdefault(couple.batiment_id, []).append(couple.gain_indicatif_pct)
        if couple.etat in (EtatCouple.applicable, EtatCouple.deja_realise):
            nb_leviers_par_batiment[couple.batiment_id] = nb_leviers_par_batiment.get(couple.batiment_id, 0) + 1

    nb_qualifies_3_leviers = sum(1 for n in nb_leviers_par_batiment.values() if n >= 3)

    gains_cumules = [ecreter_gains_combines(gains) for gains in gains_par_batiment.values()]
    gain_potentiel_moyen_pct = sum(gains_cumules) / len(gains_cumules) if gains_cumules else 0.0

    classement = sorted(
        documentes,
        key=lambda b: (b.conso_mesuree_kwh_m2 - OBJECTIF_2030_KWH_M2) / OBJECTIF_2030_KWH_M2,
        reverse=True,
    )

    return {
        "conso_moyenne_ponderee_kwh_m2": round(conso_moyenne_ponderee, 1),
        "ecart_moyen_objectif_2030_pct": round(ecart_moyen_pct, 1),
        "nb_batiments_qualifies_3_leviers": nb_qualifies_3_leviers,
        "nb_batiments_documentes": len(documentes),
        "gain_potentiel_moyen_pct": round(gain_potentiel_moyen_pct, 1),
        "objectif_2030_kwh_m2": OBJECTIF_2030_KWH_M2,
        "classement_ecart_objectif": [
            {
                "batiment": b,
                "ecart_pct": round((b.conso_mesuree_kwh_m2 - OBJECTIF_2030_KWH_M2) / OBJECTIF_2030_KWH_M2 * 100, 1),
            }
            for b in classement
        ],
    }
