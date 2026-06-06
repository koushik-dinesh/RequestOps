from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.utils.http import ApiError, error_response


def _field_errors(exc: RequestValidationError) -> dict:
    field_errors: dict[str, list[str]] = {}
    for error in exc.errors():
        loc = [str(part) for part in error.get("loc", []) if part not in ("body", "query", "path")]
        field = loc[-1] if loc else "root"
        field_errors.setdefault(field, []).append(error.get("msg", "Invalid value."))
    return {"fieldErrors": field_errors, "formErrors": []}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error_handler(_request: Request, exc: ApiError):
        return error_response(exc.status_code, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_request: Request, exc: RequestValidationError):
        return error_response(400, "Validation failed.", _field_errors(exc))

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(_request: Request, exc: StarletteHTTPException):
        return error_response(exc.status_code, str(exc.detail))

    @app.exception_handler(Exception)
    async def unexpected_error_handler(_request: Request, exc: Exception):
        print(exc)
        return error_response(500, "Unexpected server error.")
