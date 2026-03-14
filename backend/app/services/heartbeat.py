"""
SmartProctor - Heartbeat & Zombie Hunter Servisi
- Heartbeat: Öğrenci bağlantısını takip eder (30sn aralıklarla)
- Zombie Hunter: Bağlantısı kopan oturumları tespit eder ve sonlandırır
"""

from datetime import datetime, timezone, timedelta
from typing import Dict, Optional
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.models.session import ExamSession, SessionStatus
from app.models.violation import Violation, ViolationType

# In-memory heartbeat cache
# Key: session_id -> Value: last_heartbeat_time
_heartbeat_cache: Dict[int, datetime] = {}
_cache_lock = asyncio.Lock()

# Konfigürasyon
HEARTBEAT_INTERVAL_SECONDS = 30  # Öğrenci bu aralıkta heartbeat gönderir
ZOMBIE_THRESHOLD_SECONDS = 90    # Bu süre heartbeat gelmezse zombie kabul edilir
ZOMBIE_HUNTER_INTERVAL_SECONDS = 60  # Zombie hunter bu aralıkta çalışır


async def record_heartbeat(session_id: int) -> dict:
    """
    Öğrenciden gelen heartbeat'i kaydeder.
    
    Returns:
        dict: { "status": "ok", "server_time": "...", "next_heartbeat_in": 30 }
    """
    now = datetime.now(timezone.utc)
    
    async with _cache_lock:
        _heartbeat_cache[session_id] = now
    
    return {
        "status": "ok",
        "server_time": now.isoformat(),
        "next_heartbeat_in": HEARTBEAT_INTERVAL_SECONDS,
    }


async def get_last_heartbeat(session_id: int) -> Optional[datetime]:
    """Oturumun son heartbeat zamanını döndürür."""
    async with _cache_lock:
        return _heartbeat_cache.get(session_id)


async def remove_heartbeat(session_id: int):
    """Oturum bittiğinde heartbeat kaydını temizler."""
    async with _cache_lock:
        _heartbeat_cache.pop(session_id, None)


async def find_zombie_sessions() -> list[int]:
    """
    Heartbeat'i kesilen (zombie) oturumları tespit eder.
    
    Returns:
        list[int]: Zombie oturum ID'leri
    """
    now = datetime.now(timezone.utc)
    threshold = timedelta(seconds=ZOMBIE_THRESHOLD_SECONDS)
    zombies = []
    
    async with _cache_lock:
        for session_id, last_heartbeat in _heartbeat_cache.items():
            if (now - last_heartbeat) > threshold:
                zombies.append(session_id)
    
    return zombies


async def terminate_zombie_session(
    session_id: int, 
    db: AsyncSession,
    reason: str = "CONNECTION_LOST"
) -> bool:
    """
    Zombie oturumu sonlandırır ve CONNECTION_LOST ihlali kaydeder.
    
    Returns:
        True: Başarıyla sonlandırıldı
        False: Oturum bulunamadı veya zaten sonlanmış
    """
    # Oturumu getir
    result = await db.execute(
        select(ExamSession).where(
            ExamSession.id == session_id,
            ExamSession.status.in_([SessionStatus.started, SessionStatus.in_progress])
        )
    )
    session = result.scalar_one_or_none()
    
    if not session:
        # Oturum yok veya zaten bitmiş, cache'den temizle
        await remove_heartbeat(session_id)
        return False
    
    # Oturumu sonlandır
    session.status = SessionStatus.terminated
    session.finished_at = datetime.now(timezone.utc)
    
    # CONNECTION_LOST ihlali kaydet
    violation = Violation(
        session_id=session_id,
        violation_type=ViolationType.OTHER,  # Veya yeni bir CONNECTION_LOST tipi eklenebilir
        confidence=1.0,
        metadata_json={"reason": reason, "last_heartbeat": _heartbeat_cache.get(session_id, "").isoformat() if _heartbeat_cache.get(session_id) else None},
    )
    db.add(violation)
    
    await db.flush()
    
    # Cache'den temizle
    await remove_heartbeat(session_id)
    
    return True


# ============================================================================
# ZOMBIE HUNTER BACKGROUND TASK
# ============================================================================

_zombie_hunter_task: Optional[asyncio.Task] = None
_db_session_factory = None


def set_db_session_factory(factory):
    """DB session factory'yi ayarlar (main.py'den çağrılır)."""
    global _db_session_factory
    _db_session_factory = factory


async def _zombie_hunter_loop():
    """
    Periyodik olarak zombie oturumları tespit edip sonlandırır.
    Background task olarak çalışır.
    """
    while True:
        try:
            await asyncio.sleep(ZOMBIE_HUNTER_INTERVAL_SECONDS)
            
            zombies = await find_zombie_sessions()
            
            if zombies and _db_session_factory:
                async with _db_session_factory() as db:
                    for session_id in zombies:
                        try:
                            terminated = await terminate_zombie_session(session_id, db)
                            if terminated:
                                print(f"[ZombieHunter] Oturum #{session_id} sonlandırıldı (bağlantı koptu)")
                        except Exception as e:
                            print(f"[ZombieHunter] Oturum #{session_id} sonlandırılamadı: {e}")
                    await db.commit()
        except asyncio.CancelledError:
            print("[ZombieHunter] Task iptal edildi")
            break
        except Exception as e:
            print(f"[ZombieHunter] Hata: {e}")


def start_zombie_hunter():
    """Zombie hunter background task'ı başlatır."""
    global _zombie_hunter_task
    if _zombie_hunter_task is None or _zombie_hunter_task.done():
        _zombie_hunter_task = asyncio.create_task(_zombie_hunter_loop())
        print("[ZombieHunter] Background task başlatıldı")


def stop_zombie_hunter():
    """Zombie hunter background task'ı durdurur."""
    global _zombie_hunter_task
    if _zombie_hunter_task and not _zombie_hunter_task.done():
        _zombie_hunter_task.cancel()
        print("[ZombieHunter] Background task durduruldu")
