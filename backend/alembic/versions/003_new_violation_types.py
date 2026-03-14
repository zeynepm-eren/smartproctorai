"""
Add new violation types: NO_FACE, HEAD_TURN, CONNECTION_LOST, KEYBOARD_SHORTCUT

Revision ID: 003_new_violation_types
Revises: 002_xxx
Create Date: 2025-01-XX
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '003_new_violation_types'
down_revision = None  # Önceki migration ID'si ile değiştirin
branch_labels = None
depends_on = None


def upgrade():
    """
    Yeni ihlal tiplerini enum'a ekle.
    PostgreSQL'de enum değişikliği için ALTER TYPE kullanılır.
    """
    # Yeni violation tipleri
    new_types = [
        'NO_FACE',
        'MULTIPLE_FACES', 
        'HEAD_TURN',
        'CONNECTION_LOST',
        'KEYBOARD_SHORTCUT',
        'COPY_PASTE',
    ]
    
    for vtype in new_types:
        op.execute(f"""
            DO $$ 
            BEGIN 
                ALTER TYPE smartproctor.violation_type ADD VALUE IF NOT EXISTS '{vtype}';
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        """)
    
    # Heartbeat için sessions tablosuna last_heartbeat kolonu ekle (opsiyonel)
    # In-memory cache kullanıyoruz ama DB'de de tutmak istenirse:
    # op.add_column(
    #     'exam_sessions',
    #     sa.Column('last_heartbeat', sa.DateTime(timezone=True), nullable=True),
    #     schema='smartproctor'
    # )


def downgrade():
    """
    PostgreSQL'de enum değerlerini kaldırmak zordur.
    Genellikle enum'u yeniden oluşturmak gerekir.
    Bu migration'ı geri almak için manual müdahale gerekebilir.
    """
    pass
