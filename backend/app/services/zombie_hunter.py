"""
SmartProctor - Zombie Hunter Service
Heartbeat'i kesilen oturumları otomatik olarak tespit eder ve işler.

Bu servis:
1. Her 30 saniyede bir çalışır
2. last_heartbeat > 90 saniye olan aktif oturumları bulur
3. CONNECTION_LOST ihlali oluşturur
4. Gözetmenlere bildirim gönderir
5. Opsiyonel: Oturumu otomatik sonlandırır

Kullanım:
    - FastAPI lifespan ile başlatılır
    - Veya Celery/APScheduler ile çalıştırılabilir
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from contextlib import asynccontextmanager

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.models.session import ExamSession, SessionStatus
from app.models.violation import Violation, ViolationType, ViolationReview
from app.models.proctor import ProctorAssignment, Notification

# ============================================================================
# YAPILANDIRMA
# ============================================================================

ZOMBIE_CHECK_INTERVAL = 30          # Saniye cinsinden kontrol aralığı
HEARTBEAT_TIMEOUT = 60              # Bu kadar süre heartbeat yoksa zombie
HEARTBEAT_GRACE_PERIOD = 90         # Kesin zombie tespiti için
AUTO_TERMINATE_ZOMBIES = False      # True ise otomatik sonlandır

logger = logging.getLogger("smartproctor.zombie_hunter")


class ZombieHunter:
    """
    Background task olarak çalışan Zombie Hunter servisi.
    """
    
    def __init__(self):
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._stats = {
            "runs": 0,
            "zombies_detected": 0,
            "violations_created": 0,
            "sessions_terminated": 0,
            "last_run": None,
            "errors": 0,
        }
    
    @property
    def is_running(self) -> bool:
        return self._running
    
    @property
    def stats(self) -> dict:
        return self._stats.copy()
    
    async def start(self):
        """Zombie Hunter'ı başlatır."""
        if self._running:
            logger.warning("Zombie Hunter zaten çalışıyor")
            return
        
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("Zombie Hunter başlatıldı")
    
    async def stop(self):
        """Zombie Hunter'ı durdurur."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Zombie Hunter durduruldu")
    
    async def _run_loop(self):
        """Ana döngü - her 30 saniyede bir zombie kontrolü yapar."""
        while self._running:
            try:
                await self._hunt_zombies()
                self._stats["runs"] += 1
                self._stats["last_run"] = datetime.now(timezone.utc).isoformat()
            except Exception as e:
                logger.error(f"Zombie Hunter hatası: {e}")
                self._stats["errors"] += 1
            
            # Sonraki kontrole kadar bekle
            await asyncio.sleep(ZOMBIE_CHECK_INTERVAL)
    
    async def _hunt_zombies(self):
        """Zombie oturumları tespit eder ve işler."""
        async with async_session_factory() as db:
            now = datetime.now(timezone.utc)
            timeout_threshold = now - timedelta(seconds=HEARTBEAT_GRACE_PERIOD)
            
            # ----------------------------------------------------------------
            # 1. ZOMBIE OTURUMLARI BUL
            # ----------------------------------------------------------------
            # last_heartbeat alanı olan ve timeout'a uğramış aktif oturumlar
            result = await db.execute(
                select(ExamSession).where(
                    ExamSession.status.in_([
                        SessionStatus.started, 
                        SessionStatus.in_progress
                    ]),
                    # last_heartbeat alanı varsa kontrol et
                    # Yoksa started_at'i kullan
                )
            )
            
            active_sessions = result.scalars().all()
            zombies = []
            
            for session in active_sessions:
                # last_heartbeat varsa onu, yoksa started_at'i kullan
                last_hb = getattr(session, 'last_heartbeat', None) or session.started_at
                
                if last_hb and last_hb < timeout_threshold:
                    zombies.append(session)
            
            if not zombies:
                return
            
            logger.info(f"{len(zombies)} zombie oturum tespit edildi")
            self._stats["zombies_detected"] += len(zombies)
            
            # ----------------------------------------------------------------
            # 2. HER ZOMBİE İÇİN İŞLEM YAP
            # ----------------------------------------------------------------
            for session in zombies:
                await self._process_zombie(db, session, now)
            
            await db.commit()
    
    async def _process_zombie(
        self, 
        db: AsyncSession, 
        session: ExamSession, 
        now: datetime
    ):
        """Tek bir zombie oturumu işler."""
        
        last_hb = getattr(session, 'last_heartbeat', None) or session.started_at
        seconds_since = int((now - last_hb).total_seconds()) if last_hb else 0
        
        # Daha önce CONNECTION_LOST kaydedilmiş mi kontrol et
        existing = await db.execute(
            select(Violation).where(
                Violation.session_id == session.id,
                Violation.violation_type == ViolationType.CONNECTION_LOST,
                Violation.detected_at >= now - timedelta(minutes=5),  # Son 5 dakikada
            )
        )
        
        if existing.scalar_one_or_none():
            # Zaten kayıtlı, tekrar ekleme
            return
        
        # ----------------------------------------------------------------
        # CONNECTION_LOST İHLALİ OLUŞTUR
        # ----------------------------------------------------------------
        violation = Violation(
            session_id=session.id,
            violation_type=ViolationType.CONNECTION_LOST,
            confidence=1.0,
            metadata_json={
                "reason": "heartbeat_timeout",
                "last_heartbeat": last_hb.isoformat() if last_hb else None,
                "seconds_since_heartbeat": seconds_since,
                "detected_by": "zombie_hunter",
            },
        )
        db.add(violation)
        await db.flush()
        await db.refresh(violation)
        
        self._stats["violations_created"] += 1
        logger.info(f"CONNECTION_LOST ihlali oluşturuldu: Session #{session.id}")
        
        # ----------------------------------------------------------------
        # GÖZETMENLERE ATA VE BİLDİRİM GÖNDER
        # ----------------------------------------------------------------
        proctor_result = await db.execute(
            select(ProctorAssignment).where(
                ProctorAssignment.exam_id == session.exam_id
            )
        )
        assignments = proctor_result.scalars().all()
        
        for assignment in assignments[:2]:
            review = ViolationReview(
                violation_id=violation.id,
                proctor_id=assignment.proctor_id,
            )
            db.add(review)
            
            notif = Notification(
                user_id=assignment.proctor_id,
                title="⚠️ Bağlantı Koptu",
                body=f"Oturum #{session.id} - {seconds_since}sn'dir yanıt yok",
                link=f"/proctor/review/{violation.id}",
            )
            db.add(notif)
        
        # ----------------------------------------------------------------
        # OPSİYONEL: OTOMATİK SONLANDIRMA
        # ----------------------------------------------------------------
        if AUTO_TERMINATE_ZOMBIES:
            session.status = SessionStatus.terminated
            session.finished_at = now
            self._stats["sessions_terminated"] += 1
            logger.warning(f"Oturum sonlandırıldı: #{session.id}")


# ============================================================================
# GLOBAL INSTANCE
# ============================================================================

zombie_hunter = ZombieHunter()


# ============================================================================
# FASTAPI LIFESPAN ENTEGRASYONU
# ============================================================================

@asynccontextmanager
async def zombie_hunter_lifespan(app):
    """
    FastAPI lifespan event handler.
    
    Kullanım (main.py'de):
        from app.services.zombie_hunter import zombie_hunter_lifespan
        
        app = FastAPI(lifespan=zombie_hunter_lifespan)
    """
    # Startup
    await zombie_hunter.start()
    
    yield
    
    # Shutdown
    await zombie_hunter.stop()


# ============================================================================
# MANUEL KONTROL ENDPOINT'LERİ
# ============================================================================

from fastapi import APIRouter, Depends
from app.core.deps import require_role

zombie_router = APIRouter(prefix="/api/admin/zombie-hunter", tags=["Zombie Hunter"])


@zombie_router.get("/status")
async def get_zombie_hunter_status(
    current_user = Depends(require_role("admin", "instructor"))
):
    """Zombie Hunter durumunu döndürür."""
    return {
        "is_running": zombie_hunter.is_running,
        "stats": zombie_hunter.stats,
        "config": {
            "check_interval_seconds": ZOMBIE_CHECK_INTERVAL,
            "heartbeat_timeout_seconds": HEARTBEAT_TIMEOUT,
            "grace_period_seconds": HEARTBEAT_GRACE_PERIOD,
            "auto_terminate": AUTO_TERMINATE_ZOMBIES,
        }
    }


@zombie_router.post("/run-now")
async def run_zombie_hunter_now(
    current_user = Depends(require_role("admin"))
):
    """Zombie Hunter'ı manuel olarak çalıştırır."""
    await zombie_hunter._hunt_zombies()
    return {
        "message": "Zombie hunt tamamlandı",
        "stats": zombie_hunter.stats,
    }
