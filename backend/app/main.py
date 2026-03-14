"""
SmartProctor - Ana Uygulama Giriş Noktası
FastAPI uygulamasını yapılandırır ve tüm router'ları bağlar.
+ Zombie Hunter background task
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.core.database import async_session_factory
from app.routers import auth, courses, exams, sessions, violations, extras
from app.middleware.audit import AuditLogMiddleware
from app.services.heartbeat import set_db_session_factory, start_zombie_hunter, stop_zombie_hunter


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Uygulama başlangıç ve bitiş olaylarını yönetir.
    - Başlangıçta Zombie Hunter'ı başlat
    - Bitişte Zombie Hunter'ı durdur
    """
    # Startup
    set_db_session_factory(async_session_factory)
    start_zombie_hunter()
    print("[SmartProctor] Uygulama başlatıldı")
    
    yield
    
    # Shutdown
    stop_zombie_hunter()
    print("[SmartProctor] Uygulama kapatıldı")


# FastAPI uygulaması oluştur
app = FastAPI(
    title=settings.APP_NAME,
    description="AI Destekli Online Sınav Gözetim Sistemi",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS Ayarları
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Audit Log Middleware
app.add_middleware(AuditLogMiddleware)

# Statik dosyalar (video kanıtları)
app.mount("/evidence", StaticFiles(directory="static/evidence"), name="evidence")

# Router'ları bağla
app.include_router(auth.router)
app.include_router(courses.router)
app.include_router(exams.router)
app.include_router(sessions.router)
app.include_router(violations.router)
app.include_router(violations.notifications_router)
app.include_router(extras.router)


@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
