from fastapi import APIRouter

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/")
def get_irradiance():
    return[{"time": 0, "ghc": 100}]

