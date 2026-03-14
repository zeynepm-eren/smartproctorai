"""
SmartProctor - İhlal Yönetimi Router (Güncellenmiş)
+ İhlal cooldown (10sn)
+ Heartbeat endpoint
+ Ders bazlı ihlal listesi (gözetmen için)
"""

from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload, joinedload
from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.core.config import settings
from app.models.user import User
from app.models.violation import (
    Violation, ViolationReview, ConflictResolution,
    ViolationType, VerificationDecision, ConflictResolutionStatus,
)
from app.models.session import ExamSession
from app.models.exam import Exam
from app.models.course import Course
from app.models.proctor import ProctorAssignment, Notification
from app.schemas.violation import (
    ViolationCreate, ViolationResponse,
    ReviewSubmit, ReviewResponse,
    ConflictResolveRequest, ConflictResponse,
    NotificationResponse,
)
from app.services.violation_cooldown import can_log_violation
from app.services.heartbeat import record_heartbeat, get_last_heartbeat
import os
import uuid

router = APIRouter(prefix="/api/violations", tags=["İhlaller"])


# ============================================================================
# HEARTBEAT ENDPOINT
# ============================================================================

@router.post("/heartbeat/{session_id}")
async def heartbeat(
    session_id: int,
    current_user: User = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """Öğrenci her 30 saniyede bir heartbeat gönderir."""
    result = await db.execute(
        select(ExamSession).where(
            ExamSession.id == session_id,
            ExamSession.student_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Oturum bulunamadı")

    if session.status.value in ("submitted", "timed_out", "terminated"):
        raise HTTPException(status_code=400, detail="Oturum zaten sonlanmış")

    response = await record_heartbeat(session_id)
    return response


@router.get("/heartbeat/{session_id}/status")
async def heartbeat_status(
    session_id: int,
    current_user: User = Depends(require_role("instructor", "proctor", "admin")),
):
    """Bir oturumun son heartbeat durumunu gösterir."""
    last_hb = await get_last_heartbeat(session_id)

    if last_hb is None:
        return {"status": "no_heartbeat", "session_id": session_id}

    now = datetime.now(timezone.utc)
    seconds_ago = (now - last_hb).total_seconds()

    return {
        "status": "active" if seconds_ago < 90 else "inactive",
        "session_id": session_id,
        "last_heartbeat": last_hb.isoformat(),
        "seconds_ago": int(seconds_ago),
    }


# ============================================================================
# İHLAL KAYIT
# ============================================================================

@router.post("/log", response_model=ViolationResponse, status_code=status.HTTP_201_CREATED)
async def log_violation(
    req: ViolationCreate,
    db: AsyncSession = Depends(get_db),
):
    """AI veya tarayıcı tarafından tespit edilen ihlali kaydeder."""
    # Cooldown kontrolü
    can_log = await can_log_violation(req.session_id, req.violation_type)
    if not can_log:
        raise HTTPException(
            status_code=429,
            detail="Bu ihlal tipi için cooldown süresi dolmadı (10sn)"
        )

    violation = Violation(
        session_id=req.session_id,
        violation_type=ViolationType(req.violation_type),
        confidence=req.confidence,
        metadata_json=req.metadata,
    )
    db.add(violation)
    await db.flush()
    await db.refresh(violation)

    # Gözetmen ataması
    result = await db.execute(
        select(ExamSession).where(ExamSession.id == req.session_id)
    )
    session = result.scalar_one_or_none()

    if session:
        result = await db.execute(
            select(ProctorAssignment).where(ProctorAssignment.exam_id == session.exam_id)
        )
        assignments = result.scalars().all()

        for assignment in assignments[:2]:
            review = ViolationReview(
                violation_id=violation.id,
                proctor_id=assignment.proctor_id,
            )
            db.add(review)

            notif = Notification(
                user_id=assignment.proctor_id,
                title="Yeni İhlal İnceleme Talebi",
                body=f"İhlal #{violation.id} incelemenizi bekliyor ({violation.violation_type.value})",
                link=f"/proctor/review/{violation.id}",
            )
            db.add(notif)

    await db.flush()
    return violation


@router.post("/upload-evidence/{violation_id}")
async def upload_evidence(
    violation_id: int,
    video: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """İhlal kanıt videosunu yükler."""
    result = await db.execute(select(Violation).where(Violation.id == violation_id))
    violation = result.scalar_one_or_none()
    if not violation:
        raise HTTPException(status_code=404, detail="İhlal bulunamadı")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    filename = f"violation_{violation_id}_{uuid.uuid4().hex[:8]}.webm"
    filepath = os.path.join(settings.UPLOAD_DIR, filename)

    with open(filepath, "wb") as f:
        content = await video.read()
        f.write(content)

    violation.video_path = f"/evidence/{filename}"
    await db.flush()

    return {"video_path": violation.video_path}


# ============================================================================
# GÖZETMEN İNCELEME - DERS BAZLI ANONİM LİSTE
# ============================================================================

@router.get("/pending-reviews")
async def get_pending_reviews(
    current_user: User = Depends(require_role("proctor")),
    db: AsyncSession = Depends(get_db),
):
    """
    Gözetmenin bekleyen inceleme listesi.
    Ders bazlı gruplandırılmış, öğrenci bilgisi ANONİM.
    """
    # İhlalleri session -> exam -> course ile birlikte getir
    result = await db.execute(
        select(Violation)
        .join(ViolationReview, ViolationReview.violation_id == Violation.id)
        .join(ExamSession, ExamSession.id == Violation.session_id)
        .join(Exam, Exam.id == ExamSession.exam_id)
        .join(Course, Course.id == Exam.course_id)
        .where(
            ViolationReview.proctor_id == current_user.id,
            ViolationReview.decision == VerificationDecision.pending,
        )
        .options(
            selectinload(Violation.session).selectinload(ExamSession.exam).selectinload(Exam.course)
        )
    )
    violations = result.scalars().unique().all()

    # Ders bazlı gruplandır ve anonim yanıt oluştur
    response = []
    for v in violations:
        course = v.session.exam.course if v.session and v.session.exam else None
        response.append({
            "id": v.id,
            "session_id": v.session_id,
            "violation_type": v.violation_type.value,
            "confidence": float(v.confidence) if v.confidence else None,
            "video_path": v.video_path,
            "detected_at": v.detected_at.isoformat() if v.detected_at else None,
            "created_at": v.created_at.isoformat() if v.created_at else None,
            # Ders bilgisi (öğrenci bilgisi YOK - anonim)
            "course_id": course.id if course else None,
            "course_code": course.code if course else None,
            "course_name": course.name if course else None,
            "exam_title": v.session.exam.title if v.session and v.session.exam else None,
        })

    return response


@router.post("/review/{violation_id}", response_model=ReviewResponse)
async def submit_review(
    violation_id: int,
    req: ReviewSubmit,
    current_user: User = Depends(require_role("proctor")),
    db: AsyncSession = Depends(get_db),
):
    """Gözetmen ihlal kararını verir (çift kör)."""
    result = await db.execute(
        select(ViolationReview).where(
            ViolationReview.violation_id == violation_id,
            ViolationReview.proctor_id == current_user.id,
        )
    )
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=404, detail="İnceleme ataması bulunamadı")

    if review.decision != VerificationDecision.pending:
        raise HTTPException(status_code=400, detail="Bu inceleme zaten tamamlanmış")

    review.decision = VerificationDecision(req.decision)
    review.comment = req.comment
    review.reviewed_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(review)

    # Uyuşmazlık kontrolü
    result = await db.execute(
        select(ViolationReview).where(ViolationReview.violation_id == violation_id)
    )
    all_reviews = result.scalars().all()
    completed_reviews = [r for r in all_reviews if r.decision != VerificationDecision.pending]

    if len(completed_reviews) >= 2:
        decisions = set(r.decision.value for r in completed_reviews)
        if len(decisions) > 1:
            # Uyuşmazlık: Eğitmene düşür
            result = await db.execute(
                select(Violation).where(Violation.id == violation_id)
            )
            violation = result.scalar_one()
            result = await db.execute(
                select(ExamSession).where(ExamSession.id == violation.session_id)
            )
            session = result.scalar_one()
            result = await db.execute(
                select(Exam).where(Exam.id == session.exam_id)
            )
            exam = result.scalar_one()
            result = await db.execute(select(Course).where(Course.id == exam.course_id))
            course = result.scalar_one()

            conflict = ConflictResolution(
                violation_id=violation_id,
                instructor_id=course.instructor_id,
            )
            db.add(conflict)

            notif = Notification(
                user_id=course.instructor_id,
                title="Uyuşmazlık Çözümü Gerekli",
                body=f"İhlal #{violation_id} için gözetmenler uyuşamadı.",
                link=f"/instructor/conflict/{violation_id}",
            )
            db.add(notif)
            await db.flush()

    return review


# ============================================================================
# UYUŞMAZLIK ÇÖZÜMÜ
# ============================================================================

@router.get("/conflicts", response_model=List[ConflictResponse])
async def list_conflicts(
    current_user: User = Depends(require_role("instructor")),
    db: AsyncSession = Depends(get_db),
):
    """Eğitmenin çözmesi gereken uyuşmazlıkları listeler."""
    result = await db.execute(
        select(ConflictResolution).where(
            ConflictResolution.instructor_id == current_user.id,
            ConflictResolution.final_decision == ConflictResolutionStatus.pending,
        )
    )
    return result.scalars().all()


@router.post("/conflicts/{violation_id}/resolve", response_model=ConflictResponse)
async def resolve_conflict(
    violation_id: int,
    req: ConflictResolveRequest,
    current_user: User = Depends(require_role("instructor")),
    db: AsyncSession = Depends(get_db),
):
    """Eğitmen nihai kararı verir."""
    result = await db.execute(
        select(ConflictResolution).where(
            ConflictResolution.violation_id == violation_id,
            ConflictResolution.instructor_id == current_user.id,
        )
    )
    conflict = result.scalar_one_or_none()
    if not conflict:
        raise HTTPException(status_code=404, detail="Uyuşmazlık bulunamadı")

    conflict.final_decision = ConflictResolutionStatus(req.final_decision)
    conflict.comment = req.comment
    conflict.resolved_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(conflict)
    return conflict


# ============================================================================
# BİLDİRİMLER
# ============================================================================

notifications_router = APIRouter(prefix="/api/notifications", tags=["Bildirimler"])


@notifications_router.get("/", response_model=List[NotificationResponse])
async def list_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Kullanıcının bildirimlerini listeler."""
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    )
    return result.scalars().all()


@notifications_router.put("/{notification_id}/read")
async def mark_as_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Bildirimi okundu olarak işaretler."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )
    notif = result.scalar_one_or_none()
    if notif:
        notif.is_read = True
        await db.flush()
    return {"ok": True}