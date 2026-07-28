from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.models import Batiment, CoupleBatimentLevier, Levier

router = APIRouter(prefix="/leviers", tags=["leviers"])


@router.get("")
def lister_leviers(session: Session = Depends(get_session)):
    return session.exec(select(Levier)).all()


@router.get("/{levier_id}/batiments")
def batiments_pour_levier(levier_id: int, session: Session = Depends(get_session)):
    levier = session.get(Levier, levier_id)
    if not levier:
        raise HTTPException(status_code=404, detail="Levier introuvable")

    couples = session.exec(
        select(CoupleBatimentLevier, Batiment)
        .where(CoupleBatimentLevier.levier_id == levier_id)
        .join(Batiment, Batiment.id == CoupleBatimentLevier.batiment_id)
    ).all()

    lignes = [
        {
            "batiment": batiment,
            "etat": couple.etat,
            "gain_indicatif_pct": couple.gain_indicatif_pct,
            "commentaire": couple.commentaire,
        }
        for couple, batiment in couples
    ]

    return {"levier": levier, "batiments": lignes}
