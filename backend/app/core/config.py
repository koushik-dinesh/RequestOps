from functools import lru_cache
from pathlib import Path
from urllib.parse import quote_plus

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    node_env: str = Field(default="development", alias="NODE_ENV")
    port: int = Field(default=4000, alias="PORT")
    client_origin: str = Field(default="http://localhost:5173", alias="CLIENT_ORIGIN")

    db_host: str = Field(default="127.0.0.1", alias="DB_HOST")
    db_port: int = Field(default=3306, alias="DB_PORT")
    db_user: str = Field(default="root", alias="DB_USER")
    db_password: str = Field(default="", alias="DB_PASSWORD")
    db_name: str = Field(default="requestops", alias="DB_NAME")

    jwt_access_secret: str = Field(default="dev-access-secret-change-me", alias="JWT_ACCESS_SECRET")
    jwt_refresh_secret: str = Field(default="dev-refresh-secret-change-me", alias="JWT_REFRESH_SECRET")
    jwt_access_expires_in: str = Field(default="30m", alias="JWT_ACCESS_EXPIRES_IN")
    jwt_refresh_expires_in: str = Field(default="7d", alias="JWT_REFRESH_EXPIRES_IN")

    upload_dir: str = Field(default="backend/src/uploads", alias="UPLOAD_DIR")
    max_upload_mb: int = Field(default=15, alias="MAX_UPLOAD_MB")

    email_mode: str = Field(default="console", alias="EMAIL_MODE")
    smtp_host: str | None = Field(default=None, alias="SMTP_HOST")
    smtp_port: int = Field(default=587, alias="SMTP_PORT")
    smtp_user: str | None = Field(default=None, alias="SMTP_USER")
    smtp_password: str | None = Field(default=None, alias="SMTP_PASSWORD")
    smtp_from: str = Field(default="requestops@localhost", alias="SMTP_FROM")
    smtp_tls: bool = Field(default=True, alias="SMTP_TLS")
    email_log_path: str = Field(default="backend/email.log", alias="EMAIL_LOG_PATH")

    @property
    def database_url(self) -> str:
        user = quote_plus(self.db_user)
        password = quote_plus(self.db_password)
        return (
            f"mysql+pymysql://{user}:{password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}?charset=utf8mb4"
        )

    @property
    def upload_path(self) -> Path:
        return Path(self.upload_dir)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
