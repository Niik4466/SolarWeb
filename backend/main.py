from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.api.v1 import irradiance, images

app = FastAPI(title="Solar API", version="1.0.0")

# 👇 Aquí configuras CORS
origins = [
    "http://localhost:4200",   # Angular local
    "http://127.0.0.1:4200",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,      # o ["*"] si quieres permitir todos los orígenes
    allow_credentials=True,
    allow_methods=["*"],        # puedes limitar a ["GET"]
    allow_headers=["*"],
)

# Montar routers
app.include_router(irradiance.router)
app.include_router(images.router)

@app.get("/")
def root():
    return {"message": "Solar API is running"}
