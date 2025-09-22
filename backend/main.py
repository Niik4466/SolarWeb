from fastapi import FastAPI
from backend.api.v1 import irradiance, images

app = FastAPI(title="Solar API", version="1.0.0")

# Montar routers

app.include_router(irradiance.router)
app.include_router(images.router)

@app.get("/")
def root():
    return {"message": "Solar API is running"}
