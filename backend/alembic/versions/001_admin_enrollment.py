"""add admin role and course enrollments

Revision ID: 001_admin_enrollment
Revises: 
Create Date: 2024-01-15

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '001_admin_enrollment'
down_revision = None
branch_labels = None
depends_on = None

SCHEMA = 'smartproctor'


def upgrade() -> None:
    # 1. user_role enum'una 'admin' değeri ekle
    op.execute("ALTER TYPE smartproctor.user_role ADD VALUE IF NOT EXISTS 'admin'")
    
    # 2. courses.instructor_id'yi nullable yap
    op.alter_column(
        'courses',
        'instructor_id',
        existing_type=sa.BigInteger(),
        nullable=True,
        schema=SCHEMA
    )
    
    # 3. course_enrollments tablosunu oluştur
    op.create_table(
        'course_enrollments',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('course_id', sa.BigInteger(), nullable=False),
        sa.Column('student_id', sa.BigInteger(), nullable=False),
        sa.Column('enrolled_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['course_id'], ['smartproctor.courses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['smartproctor.users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('course_id', 'student_id', name='uq_course_student'),
        schema=SCHEMA
    )
    
    # 4. Index'ler
    op.create_index('idx_course_enrollments_course_id', 'course_enrollments', ['course_id'], schema=SCHEMA)
    op.create_index('idx_course_enrollments_student_id', 'course_enrollments', ['student_id'], schema=SCHEMA)


def downgrade() -> None:
    # Index'leri kaldır
    op.drop_index('idx_course_enrollments_student_id', table_name='course_enrollments', schema=SCHEMA)
    op.drop_index('idx_course_enrollments_course_id', table_name='course_enrollments', schema=SCHEMA)
    
    # Tabloyu kaldır
    op.drop_table('course_enrollments', schema=SCHEMA)
    
    # instructor_id'yi tekrar NOT NULL yap
    op.alter_column(
        'courses',
        'instructor_id',
        existing_type=sa.BigInteger(),
        nullable=False,
        schema=SCHEMA
    )
    
    # NOT: PostgreSQL'de enum değerlerini kaldırmak kolay değil
    # 'admin' değerini manuel olarak kaldırmanız gerekebilir