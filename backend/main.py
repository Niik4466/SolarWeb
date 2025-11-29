from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.v1 import irradiance, images, export, users, mail, monitor
from services.monitor_service import init_monitoring

app = FastAPI(title="Solar API", version="1.0.0")

# 👇 Aquí configuras CORS
ALLOWED_ORIGINS = [
    "http://localhost",
    "http://localhost:8000",
    "http://localhost:3002",
    "http://127.0.0.1:3002",
    "http://localhost:4200",     # solo si accedes directamente a 4200 sin redirección
    "http://127.0.0.1:4200",
    "http://frontend:4200",
    "http://frontend-solarweb:4200"
]


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # o ["*"] si quieres permitir todos los orígenes
    allow_credentials=True,
    allow_methods=["*"],        # puedes limitar a ["GET"]
    allow_headers=["*"],
)

# Montar routers
app.include_router(irradiance.router)
app.include_router(images.router)
app.include_router(export.router)
app.include_router(users.router)
app.include_router(mail.router)
app.include_router(monitor.router)

@app.on_event("startup")
async def startup_event():
    init_monitoring()

@app.get("/")
def root():
    return {"message": "Solar API is running"}

