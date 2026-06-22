from collections.abc import Callable
from typing import Any

from fastapi import APIRouter


def collection_route(router: APIRouter, method: str, **kwargs: Any) -> Callable:
    """Register both /resource and /resource/ for collection endpoints."""
    register = getattr(router, method.lower())
    trailing_slash_kwargs = {**kwargs, "include_in_schema": False}

    def decorator(func: Callable) -> Callable:
        register("", **kwargs)(func)
        register("/", **trailing_slash_kwargs)(func)
        return func

    return decorator
