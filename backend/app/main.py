from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import batiments, indicateurs, leviers
from app.seed import seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed()
    yield


app = FastAPI(title="SDTE — API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(batiments.router)
app.include_router(leviers.router)
app.include_router(indicateurs.router)


@app.get("/")
def racine():
    return {"status": "ok", "app": "SDTE"}
