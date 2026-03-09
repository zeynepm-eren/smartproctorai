"""
SmartProctor - Alembic Environment Configuration
"""

from logging.config import fileConfig
import sys
from pathlib import Path

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Backend klasörünü Python path'e ekle
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Modelleri import et
from app.core.database import Base
from app.models.user import User
from app.models.course import Course, CourseEnrollment
from app.models.exam import Exam
from app.models.session import ExamSession
from app.models.refresh_token import RefreshToken
from app.models.proctor import ProctorAssignment
# Diğer modelleriniz varsa buraya ekleyin

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Model metadata'sını bağla (autogenerate için)
target_metadata = Base.metadata

# Schema ayarı
SCHEMA_NAME = "smartproctor"


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=True,
        version_table_schema=SCHEMA_NAME,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_schemas=True,
            version_table_schema=SCHEMA_NAME,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()