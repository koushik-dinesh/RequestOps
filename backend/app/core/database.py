from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def rows(db: Session, sql: str, params: dict | None = None) -> list[dict]:
    result = db.execute(text(sql), params or {})
    return [dict(row) for row in result.mappings().all()]


def one(db: Session, sql: str, params: dict | None = None) -> dict | None:
    result = db.execute(text(sql), params or {})
    row = result.mappings().first()
    return dict(row) if row else None


def execute(db: Session, sql: str, params: dict | None = None):
    return db.execute(text(sql), params or {})
