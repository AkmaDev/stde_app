from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.models import Batiment, CoupleBatimentLevier, Levier
from app.scoring import calculer_score

router = APIRouter(prefix="/batiments", tags=["batiments"])


@router.get("")
def lister_batiments(session: Session = Depends(get_session)):
    batiments = session.exec(select(Batiment)).all()
    resultats = []
    for batiment in batiments:
        score = calculer_score(batiment)
        resultats.append({
            "batiment": batiment,
            "score": score,
        })
    return resultats


@router.get("/{batiment_id}")
def detail_batiment(batiment_id: int, session: Session = Depends(get_session)):
    batiment = session.get(Batiment, batiment_id)
    if not batiment:
        raise HTTPException(status_code=404, detail="Bâtiment introuvable")

    couples = session.exec(
        select(CoupleBatimentLevier, Levier)
        .where(CoupleBatimentLevier.batiment_id == batiment_id)
        .join(Levier, Levier.id == CoupleBatimentLevier.levier_id)
    ).all()

    leviers = [
        {
            "levier": levier,
            "etat": couple.etat,
            "gain_indicatif_pct": couple.gain_indicatif_pct,
            "commentaire": couple.commentaire,
        }
        for couple, levier in couples
    ]

    return {
        "batiment": batiment,
        "score": calculer_score(batiment),
        "leviers": leviers,
    }
