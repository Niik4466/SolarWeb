from fastapi import FastAPI
from api.v1 import irradiance

app = FastAPI(title="Solar API", version="1.0.0")

# Montar routers

app.include_router(irradiance.router)

@app.get("/")
def root():
    return {"message": "Solar API is running ✨"}
