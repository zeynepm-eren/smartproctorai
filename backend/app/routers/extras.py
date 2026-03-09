"""
SmartProctor - Ek Endpoint'ler
Admin istatistikleri, kullanıcı listeleri, gözetmen atama, sınav sonuçları.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.user import User, UserRole
from app.models.exam import Exam
from app.models.session import ExamSession
from app.models.proctor import ProctorAssignment
from app.models.course import Course, CourseEnrollment
from app.schemas.auth import UserResponse
from app.schemas.session import SessionResponse
from pydantic import BaseModel

router = APIRouter(tags=["Ek İşlemler"])


# =============================================================================
# ŞEMALAR
# =============================================================================

class UserListResponse(BaseModel):
    id: int
    email: str
    first_name: str
    last_name: str
    role: str
    is_active: bool
    
    class Config:
        from_attributes = True


class AdminStatsResponse(BaseModel):
    total_users: int
    total_students: int
    total_instructors: int
    total_proctors: int
    total_admins: int
    total_courses: int
    total_exams: int
    active_courses: int


class ProctorAssignRequest(BaseModel):
    proctor_id: int


# =============================================================================
# ADMIN İSTATİSTİKLERİ
# =============================================================================

@router.get("/admin/stats", response_model=AdminStatsResponse)
async def admin_stats(
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Sistem istatistiklerini döndürür (sadece admin)."""
    
    # Kullanıcı sayıları
    total_users = await db.scalar(select(func.count(User.id)))
    total_students = await db.scalar(
        select(func.count(User.id)).where(User.role == UserRole.student)
    )
    total_instructors = await db.scalar(
        select(func.count(User.id)).where(User.role == UserRole.instructor)
    )
    total_proctors = await db.scalar(
        select(func.count(User.id)).where(User.role == UserRole.proctor)
    )
    total_admins = await db.scalar(
        select(func.count(User.id)).where(User.role == UserRole.admin)
    )
    
    # Ders sayıları
    total_courses = await db.scalar(select(func.count(Course.id)))
    active_courses = await db.scalar(
        select(func.count(Course.id)).where(Course.is_active == True)
    )
    
    # Sınav sayısı
    total_exams = await db.scalar(select(func.count(Exam.id)))
    
    return AdminStatsResponse(
        total_users=total_users or 0,
        total_students=total_students or 0,
        total_instructors=total_instructors or 0,
        total_proctors=total_proctors or 0,
        total_admins=total_admins or 0,
        total_courses=total_courses or 0,
        total_exams=total_exams or 0,
        active_courses=active_courses or 0,
    )


# =============================================================================
# KULLANICI LİSTELERİ
# =============================================================================

@router.get("/auth/users", response_model=List[UserListResponse])
async def list_users(
    role: Optional[str] = Query(None, description="Rol filtresi: student, instructor, proctor, admin"),
    search: Optional[str] = Query(None, description="İsim veya email araması"),
    current_user: User = Depends(require_role("admin", "instructor")),
    db: AsyncSession = Depends(get_db),
):
    """
    Kullanıcı listesi.
    - Admin: Tüm kullanıcıları görebilir
    - Eğitmen: Sadece öğrencileri görebilir
    """
    query = select(User)
    
    # Eğitmen sadece öğrencileri görebilir
    if current_user.role.value == "instructor":
        query = query.where(User.role == UserRole.student)
    elif role:
        try:
            query = query.where(User.role == UserRole(role))
        except ValueError:
            raise HTTPException(status_code=400, detail="Geçersiz rol")
    
    # Arama
    if search:
        search_term = f"%{search}%"
        query = query.where(
            (User.first_name.ilike(search_term)) |
            (User.last_name.ilike(search_term)) |
            (User.email.ilike(search_term))
        )
    
    query = query.order_by(User.first_name, User.last_name)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/auth/instructors", response_model=List[UserListResponse])
async def list_instructors(
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Eğitmen listesi (sadece admin)."""
    result = await db.execute(
        select(User)
        .where(User.role == UserRole.instructor, User.is_active == True)
        .order_by(User.first_name, User.last_name)
    )
    return result.scalars().all()


@router.get("/auth/students", response_model=List[UserListResponse])
async def list_students(
    current_user: User = Depends(require_role("admin", "instructor")),
    db: AsyncSession = Depends(get_db),
):
    """Öğrenci listesi (admin ve eğitmenler için)."""
    result = await db.execute(
        select(User)
        .where(User.role == UserRole.student, User.is_active == True)
        .order_by(User.first_name, User.last_name)
    )
    return result.scalars().all()


@router.get("/auth/proctors", response_model=List[UserListResponse])
async def list_proctors(
    current_user: User = Depends(require_role("admin", "instructor")),
    db: AsyncSession = Depends(get_db),
):
    """Gözetmen listesi (admin ve eğitmenler için)."""
    result = await db.execute(
        select(User)
        .where(User.role == UserRole.proctor, User.is_active == True)
        .order_by(User.first_name, User.last_name)
    )
    return result.scalars().all()


# =============================================================================
# GÖZETMEN ATAMA
# =============================================================================

@router.post("/exams/{exam_id}/assign-proctor")
async def assign_proctor(
    exam_id: int,
    req: ProctorAssignRequest,
    current_user: User = Depends(require_role("admin", "instructor")),
    db: AsyncSession = Depends(get_db),
):
    """Sınava gözetmen atar (admin veya dersin eğitmeni)."""
    # Sınav kontrolü
    result = await db.execute(
        select(Exam).join(Course, Course.id == Exam.course_id).where(Exam.id == exam_id)
    )
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Sınav bulunamadı")
    
    # Yetki kontrolü: Eğitmen sadece kendi dersinin sınavına atama yapabilir
    if current_user.role.value == "instructor":
        result = await db.execute(
            select(Exam)
            .join(Course, Course.id == Exam.course_id)
            .where(Exam.id == exam_id, Course.instructor_id == current_user.id)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Bu sınava gözetmen atama yetkiniz yok")

    # Gözetmen kontrolü
    result = await db.execute(
        select(User).where(User.id == req.proctor_id, User.role == UserRole.proctor)
    )
    proctor = result.scalar_one_or_none()
    if not proctor:
        raise HTTPException(status_code=404, detail="Gözetmen bulunamadı")

    # Mevcut atama kontrolü
    result = await db.execute(
        select(ProctorAssignment).where(
            ProctorAssignment.exam_id == exam_id,
            ProctorAssignment.proctor_id == req.proctor_id,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Bu gözetmen zaten atanmış")

    assignment = ProctorAssignment(exam_id=exam_id, proctor_id=req.proctor_id)
    db.add(assignment)
    await db.flush()

    return {
        "message": "Gözetmen başarıyla atandı",
        "exam_id": exam_id,
        "proctor_id": req.proctor_id,
        "proctor_name": f"{proctor.first_name} {proctor.last_name}"
    }


@router.delete("/exams/{exam_id}/remove-proctor/{proctor_id}")
async def remove_proctor(
    exam_id: int,
    proctor_id: int,
    current_user: User = Depends(require_role("admin", "instructor")),
    db: AsyncSession = Depends(get_db),
):
    """Sınavdan gözetmeni kaldırır."""
    # Yetki kontrolü
    if current_user.role.value == "instructor":
        result = await db.execute(
            select(Exam)
            .join(Course, Course.id == Exam.course_id)
            .where(Exam.id == exam_id, Course.instructor_id == current_user.id)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Bu sınavdan gözetmen kaldırma yetkiniz yok")
    
    result = await db.execute(
        select(ProctorAssignment).where(
            ProctorAssignment.exam_id == exam_id,
            ProctorAssignment.proctor_id == proctor_id,
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Atama bulunamadı")
    
    await db.delete(assignment)
    await db.flush()
    
    return {"message": "Gözetmen kaldırıldı"}


# =============================================================================
# SINAV SONUÇLARI
# =============================================================================

@router.get("/sessions/exam/{exam_id}/results", response_model=List[SessionResponse])
async def exam_results(
    exam_id: int,
    current_user: User = Depends(require_role("admin", "instructor")),
    db: AsyncSession = Depends(get_db),
):
    """Bir sınavdaki tüm öğrenci oturumlarını listeler."""
    # Yetki kontrolü
    if current_user.role.value == "instructor":
        result = await db.execute(
            select(Exam)
            .join(Course, Course.id == Exam.course_id)
            .where(Exam.id == exam_id, Course.instructor_id == current_user.id)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Bu sınavın sonuçlarını görme yetkiniz yok")
    
    result = await db.execute(
        select(ExamSession).where(ExamSession.exam_id == exam_id)
    )
    return result.scalars().all()