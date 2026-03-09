"""
SmartProctor - Ders Yönetimi Router
Ders CRUD, eğitmen atama ve öğrenci kayıt işlemleri.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.user import User, UserRole
from app.models.course import Course, CourseEnrollment
from app.schemas.course import (
    CourseCreate, CourseUpdate, CourseResponse,
    EnrollmentCreate, EnrollmentResponse,
    InstructorAssignRequest, BulkEnrollmentRequest,
)

router = APIRouter(prefix="/api/courses", tags=["Dersler"])


# =============================================================================
# DERS LİSTELEME
# =============================================================================

@router.get("/", response_model=List[CourseResponse])
async def list_courses(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Kullanıcının rolüne göre ders listesini döndürür."""
    role = current_user.role.value
    
    if role == "admin":
        # Admin tüm dersleri görür
        result = await db.execute(
            select(Course).options(selectinload(Course.instructor))
        )
    elif role == "instructor":
        # Eğitmen kendi derslerini görür
        result = await db.execute(
            select(Course)
            .options(selectinload(Course.instructor))
            .where(Course.instructor_id == current_user.id)
        )
    elif role == "student":
        # Öğrenci kayıtlı olduğu dersleri görür
        result = await db.execute(
            select(Course)
            .options(selectinload(Course.instructor))
            .join(CourseEnrollment, CourseEnrollment.course_id == Course.id)
            .where(CourseEnrollment.student_id == current_user.id)
        )
    else:
        # Gözetmen tüm aktif dersleri görür
        result = await db.execute(
            select(Course)
            .options(selectinload(Course.instructor))
            .where(Course.is_active == True)
        )

    return result.scalars().all()


@router.get("/all", response_model=List[CourseResponse])
async def list_all_courses(
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Tüm dersleri listeler (sadece admin)."""
    result = await db.execute(
        select(Course).options(selectinload(Course.instructor))
    )
    return result.scalars().all()


@router.get("/unassigned", response_model=List[CourseResponse])
async def list_unassigned_courses(
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Eğitmeni atanmamış dersleri listeler (sadece admin)."""
    result = await db.execute(
        select(Course).where(Course.instructor_id == None)
    )
    return result.scalars().all()


# =============================================================================
# DERS CRUD
# =============================================================================

@router.post("/", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
async def create_course(
    req: CourseCreate,
    current_user: User = Depends(require_role("admin", "instructor")),
    db: AsyncSession = Depends(get_db),
):
    """
    Yeni ders oluşturur.
    - Admin: instructor_id belirtebilir veya boş bırakabilir
    - Eğitmen: otomatik olarak kendisi atanır
    """
    # Kod benzersizlik kontrolü
    existing = await db.execute(select(Course).where(Course.code == req.code))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Bu ders kodu zaten kullanılıyor")
    
    # Instructor ID belirleme
    if current_user.role.value == "admin":
        instructor_id = req.instructor_id  # Admin belirleyebilir (veya None)
    else:
        instructor_id = current_user.id  # Eğitmen kendini atar
    
    course = Course(
        instructor_id=instructor_id,
        code=req.code,
        name=req.name,
        description=req.description,
    )
    db.add(course)
    await db.flush()
    await db.refresh(course)
    return course


@router.get("/{course_id}", response_model=CourseResponse)
async def get_course(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Ders detayını döndürür."""
    result = await db.execute(
        select(Course)
        .options(selectinload(Course.instructor))
        .where(Course.id == course_id)
    )
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Ders bulunamadı")
    return course


@router.put("/{course_id}", response_model=CourseResponse)
async def update_course(
    course_id: int,
    req: CourseUpdate,
    current_user: User = Depends(require_role("admin", "instructor")),
    db: AsyncSession = Depends(get_db),
):
    """Ders bilgilerini günceller (admin veya dersin eğitmeni)."""
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    
    if not course:
        raise HTTPException(status_code=404, detail="Ders bulunamadı")
    
    # Yetki kontrolü: Admin her dersi, eğitmen sadece kendi dersini
    if current_user.role.value == "instructor" and course.instructor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Bu dersi düzenleme yetkiniz yok")

    for field, value in req.model_dump(exclude_unset=True).items():
        setattr(course, field, value)

    await db.flush()
    await db.refresh(course)
    return course


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(
    course_id: int,
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Dersi siler (sadece admin)."""
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    
    if not course:
        raise HTTPException(status_code=404, detail="Ders bulunamadı")
    
    await db.delete(course)
    await db.flush()


# =============================================================================
# EĞİTMEN ATAMA (ADMIN)
# =============================================================================

@router.post("/{course_id}/assign-instructor")
async def assign_instructor(
    course_id: int,
    req: InstructorAssignRequest,
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Derse eğitmen atar (sadece admin)."""
    # Ders kontrolü
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Ders bulunamadı")
    
    # Eğitmen kontrolü
    result = await db.execute(
        select(User).where(User.id == req.instructor_id, User.role == UserRole.instructor)
    )
    instructor = result.scalar_one_or_none()
    if not instructor:
        raise HTTPException(status_code=404, detail="Eğitmen bulunamadı")
    
    course.instructor_id = req.instructor_id
    await db.flush()
    
    return {
        "message": "Eğitmen başarıyla atandı",
        "course_id": course_id,
        "instructor_id": req.instructor_id,
        "instructor_name": f"{instructor.first_name} {instructor.last_name}"
    }


@router.delete("/{course_id}/remove-instructor")
async def remove_instructor(
    course_id: int,
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Dersten eğitmeni kaldırır (sadece admin)."""
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Ders bulunamadı")
    
    course.instructor_id = None
    await db.flush()
    
    return {"message": "Eğitmen kaldırıldı", "course_id": course_id}


# =============================================================================
# ÖĞRENCİ KAYIT (ADMIN + EĞİTMEN)
# =============================================================================

@router.post("/{course_id}/enroll", response_model=EnrollmentResponse)
async def enroll_student(
    course_id: int,
    req: EnrollmentCreate,
    current_user: User = Depends(require_role("admin", "instructor")),
    db: AsyncSession = Depends(get_db),
):
    """Öğrenciyi derse kaydeder (admin veya dersin eğitmeni)."""
    # Ders kontrolü
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Ders bulunamadı")
    
    # Yetki kontrolü: Eğitmen sadece kendi dersine kayıt yapabilir
    if current_user.role.value == "instructor" and course.instructor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Bu derse öğrenci kaydetme yetkiniz yok")
    
    # Öğrenci kontrolü
    result = await db.execute(
        select(User).where(User.id == req.student_id, User.role == UserRole.student)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Öğrenci bulunamadı")
    
    # Mevcut kayıt kontrolü
    result = await db.execute(
        select(CourseEnrollment).where(
            CourseEnrollment.course_id == course_id,
            CourseEnrollment.student_id == req.student_id
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Öğrenci zaten bu derse kayıtlı")
    
    enrollment = CourseEnrollment(course_id=course_id, student_id=req.student_id)
    db.add(enrollment)
    await db.flush()
    await db.refresh(enrollment)
    return enrollment


@router.post("/{course_id}/enroll-bulk")
async def enroll_students_bulk(
    course_id: int,
    req: BulkEnrollmentRequest,
    current_user: User = Depends(require_role("admin", "instructor")),
    db: AsyncSession = Depends(get_db),
):
    """Birden fazla öğrenciyi derse kaydeder (toplu kayıt)."""
    # Ders kontrolü
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Ders bulunamadı")
    
    # Yetki kontrolü
    if current_user.role.value == "instructor" and course.instructor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Bu derse öğrenci kaydetme yetkiniz yok")
    
    enrolled = []
    skipped = []
    
    for student_id in req.student_ids:
        # Mevcut kayıt kontrolü
        result = await db.execute(
            select(CourseEnrollment).where(
                CourseEnrollment.course_id == course_id,
                CourseEnrollment.student_id == student_id
            )
        )
        if result.scalar_one_or_none():
            skipped.append(student_id)
            continue
        
        enrollment = CourseEnrollment(course_id=course_id, student_id=student_id)
        db.add(enrollment)
        enrolled.append(student_id)
    
    await db.flush()
    
    return {
        "message": f"{len(enrolled)} öğrenci kaydedildi, {len(skipped)} atlandı",
        "enrolled": enrolled,
        "skipped": skipped
    }


@router.delete("/{course_id}/unenroll/{student_id}")
async def unenroll_student(
    course_id: int,
    student_id: int,
    current_user: User = Depends(require_role("admin", "instructor")),
    db: AsyncSession = Depends(get_db),
):
    """Öğrenciyi dersten çıkarır."""
    # Ders kontrolü
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Ders bulunamadı")
    
    # Yetki kontrolü
    if current_user.role.value == "instructor" and course.instructor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Bu dersten öğrenci çıkarma yetkiniz yok")
    
    # Kayıt kontrolü
    result = await db.execute(
        select(CourseEnrollment).where(
            CourseEnrollment.course_id == course_id,
            CourseEnrollment.student_id == student_id
        )
    )
    enrollment = result.scalar_one_or_none()
    if not enrollment:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    
    await db.delete(enrollment)
    await db.flush()
    
    return {"message": "Öğrenci dersten çıkarıldı"}


@router.get("/{course_id}/students", response_model=List[EnrollmentResponse])
async def list_enrolled_students(
    course_id: int,
    current_user: User = Depends(require_role("admin", "instructor", "proctor")),
    db: AsyncSession = Depends(get_db),
):
    """Derse kayıtlı öğrenci listesini döndürür."""
    # Eğitmen yetki kontrolü
    if current_user.role.value == "instructor":
        result = await db.execute(
            select(Course).where(Course.id == course_id, Course.instructor_id == current_user.id)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Bu dersin öğrencilerini görme yetkiniz yok")
    
    result = await db.execute(
        select(CourseEnrollment)
        .options(selectinload(CourseEnrollment.student))
        .where(CourseEnrollment.course_id == course_id)
    )
    return result.scalars().all()