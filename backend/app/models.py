from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel


class OrigineDonnee(str, Enum):
    mesuree = "mesuree"
    documentee = "documentee"
    hypothese = "hypothese"


class EtatCouple(str, Enum):
    deja_realise = "deja_realise"
    applicable = "applicable"
    non_applicable = "non_applicable"
    donnees_insuffisantes = "donnees_insuffisantes"


class Batiment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    nom: str
    arrondissement: str
    statut_patrimonial: str = "Aucune contrainte"
    annee_construction: Optional[int] = None
    surface_m2: Optional[float] = None
    energie_principale: Optional[str] = None
    conso_mesuree_kwh_m2: Optional[float] = None
    conso_origine: OrigineDonnee = OrigineDonnee.hypothese
    dpe: Optional[str] = None
    orientation_vitrage_dominante: Optional[str] = None
    type_isolation: Optional[str] = None
    couverture_donnees_pct: Optional[float] = None
    derniere_maj: Optional[str] = None


class Levier(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    nom: str
    poste_concerne: str
    gain_min_pct: float
    gain_max_pct: float
    source: str = "ADEME - retours d'operations tertiaire public"


class CoupleBatimentLevier(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    batiment_id: int = Field(foreign_key="batiment.id")
    levier_id: int = Field(foreign_key="levier.id")
    etat: EtatCouple
    gain_indicatif_pct: Optional[float] = None
    commentaire: Optional[str] = None
