from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.v1 import irradiance, images, export, users, mail, monitor
from services.monitor_service import init_monitoring
from services.export_service import export_worker
import asyncio

app = FastAPI(title="Solar API", version="1.0.0")

# Configuración CORS
ALLOWED_ORIGINS = [
    "http://localhost",
    "https://solarweb.lat",
    "https://www.solarweb.lat",
    "https://solarweb.inf.uach.cl",
    "https://www.solarweb.inf.uach.cl"
]


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Montar routers
app.include_router(irradiance.router, prefix="/api")
app.include_router(images.router, prefix="/api")
app.include_router(export.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(mail.router, prefix="/api")
app.include_router(monitor.router, prefix="/api")

@app.on_event("startup")
async def startup_event():
    # Iniciar worker de monitorización en background
    init_monitoring()
    # Iniciar worker de exportación en background
    asyncio.create_task(export_worker())

@app.get("/api")
def root():
    return {"message": "Solar API is running"}

