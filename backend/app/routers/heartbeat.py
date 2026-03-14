"""
SmartProctor - Heartbeat Router
Öğrencinin sınav sırasında aktif olup olmadığını takip eder.

Özellikler:
- /heartbeat endpoint: Öğrenci her 30 saniyede bir ping atar
- last_heartbeat takibi: ExamSession tablosunda saklanır
- CONNECTION_LOST ihlali: 60+ saniye heartbeat gelmezse
"""

from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.user import User
from app.models.session import ExamSession, SessionStatus
from app.models.violation import Violation, ViolationType
from app.models.proctor import ProctorAssignment, Notification
from app.models.violation import ViolationReview
from pydantic import BaseModel

router = APIRouter(prefix="/api/heartbeat", tags=["Heartbeat"])

# ============================================================================
# YAPILANDIRMA
# ============================================================================
HEARTBEAT_INTERVAL_SECONDS = 30      # Beklenen heartbeat aralığı
HEARTBEAT_TIMEOUT_SECONDS = 60       # Bu süre geçerse CONNECTION_LOST
HEARTBEAT_GRACE_PERIOD_SECONDS = 90  # Zombie hunter için tolerans


class HeartbeatResponse(BaseModel):
    session_id: int
    status: str
    last_heartbeat: datetime
    server_time: datetime
    next_expected: datetime


class HeartbeatRequest(BaseModel):
    session_id: int


@router.post("/", response_model=HeartbeatResponse)
async def send_heartbeat(
    req: HeartbeatRequest,
    current_user: User = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """
    Öğrenci heartbeat gönderir - her 30 saniyede bir çağrılmalı.
    
    Bu endpoint:
    1. Session'ın hala aktif olduğunu doğrular
    2. last_heartbeat zamanını günceller
    3. Öğrencinin bağlı olduğunu kanıtlar
    """
    
    # Session kontrolü
    result = await db.execute(
        select(ExamSession).where(
            ExamSession.id == req.session_id,
            ExamSession.student_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Oturum bulunamadı")
    
    # Tamamlanmış oturumlara heartbeat kabul etme
    if session.status.value in ("submitted", "timed_out", "terminated"):
        raise HTTPException(
            status_code=400, 
            detail=f"Oturum zaten sonlanmış: {session.status.value}"
        )
    
    now = datetime.now(timezone.utc)
    
    # last_heartbeat güncelle (ExamSession model'ine eklenecek)
    session.last_heartbeat = now
    session.status = SessionStatus.in_progress  # Aktif olarak işaretle
    
    await db.flush()
    
    return HeartbeatResponse(
        session_id=session.id,
        status=session.status.value,
        last_heartbeat=now,
        server_time=now,
        next_expected=now + timedelta(seconds=HEARTBEAT_INTERVAL_SECONDS),
    )


@router.get("/status/{session_id}")
async def get_heartbeat_status(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Session'ın heartbeat durumunu sorgular.
    Eğitmen/Gözetmen için kullanışlı.
    """
    
    result = await db.execute(
        select(ExamSession).where(ExamSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Oturum bulunamadı")
    
    now = datetime.now(timezone.utc)
    last_hb = getattr(session, 'last_heartbeat', None) or session.started_at
    
    seconds_since_heartbeat = (now - last_hb).total_seconds()
    is_alive = seconds_since_heartbeat < HEARTBEAT_TIMEOUT_SECONDS
    
    return {
        "session_id": session.id,
        "student_id": session.student_id,
        "status": session.status.value,
        "last_heartbeat": last_hb,
        "seconds_since_heartbeat": int(seconds_since_heartbeat),
        "is_alive": is_alive,
        "timeout_threshold": HEARTBEAT_TIMEOUT_SECONDS,
    }


# ============================================================================
# ZOMBIE HUNTER - Yardımcı Fonksiyonlar
# ============================================================================

async def check_zombie_sessions(db: AsyncSession) -> list:
    """
    Heartbeat'i kesilen oturumları tespit eder.
    Background task tarafından çağrılır.
    
    Returns:
        List of zombie session IDs
    """
    now = datetime.now(timezone.utc)
    timeout_threshold = now - timedelta(seconds=HEARTBEAT_GRACE_PERIOD_SECONDS)
    
    # Aktif ama heartbeat'i eski olan oturumları bul
    result = await db.execute(
        select(ExamSession).where(
            ExamSession.status.in_([SessionStatus.started, SessionStatus.in_progress]),
            ExamSession.last_heartbeat < timeout_threshold,
        )
    )
    
    zombie_sessions = result.scalars().all()
    zombie_ids = []
    
    for session in zombie_sessions:
        # CONNECTION_LOST ihlali oluştur
        violation = Violation(
            session_id=session.id,
            violation_type=ViolationType.CONNECTION_LOST,
            confidence=1.0,
            metadata_json={
                "last_heartbeat": session.last_heartbeat.isoformat() if session.last_heartbeat else None,
                "detected_at": now.isoformat(),
                "seconds_since_heartbeat": int((now - (session.last_heartbeat or session.started_at)).total_seconds()),
            },
        )
        db.add(violation)
        
        # Gözetmenlere ata
        proctor_result = await db.execute(
            select(ProctorAssignment).where(ProctorAssignment.exam_id == session.exam_id)
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
                title="Bağlantı Koptu",
                body=f"Oturum #{session.id} için bağlantı kesildi",
                link=f"/proctor/review/{violation.id}",
            )
            db.add(notif)
        
        zombie_ids.append(session.id)
    
    await db.flush()
    return zombie_ids


async def terminate_zombie_session(db: AsyncSession, session_id: int) -> bool:
    """
    Zombie session'ı sonlandırır.
    
    Returns:
        True if terminated, False if not found
    """
    result = await db.execute(
        select(ExamSession).where(ExamSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    
    if not session:
        return False
    
    session.status = SessionStatus.terminated
    session.finished_at = datetime.now(timezone.utc)
    await db.flush()
    
    return True
