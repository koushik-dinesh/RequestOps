from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import execute, get_db, rows
from app.middleware.auth import get_current_user
from app.utils.http import ok
from app.utils.routing import collection_route


router = APIRouter(prefix="/notifications", tags=["notifications"], dependencies=[Depends(get_current_user)])


@collection_route(router, "get")
def list_notifications(isRead: str = "", user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(rows(db, """
        SELECT n.*, r.request_number, r.title AS request_title
        FROM notifications n
        LEFT JOIN requests r ON r.id = n.request_id
        WHERE n.recipient_user_id = :userId
          AND (:isRead = '' OR n.is_read = :isRead)
        ORDER BY n.created_at DESC
        LIMIT 100
    """, {"userId": user["id"], "isRead": isRead}))


@router.post("/{notification_id}/read")
def mark_read(notification_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    execute(db, """
        UPDATE notifications
        SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
        WHERE id = :id AND recipient_user_id = :userId
    """, {"id": notification_id, "userId": user["id"]})
    db.commit()
    return ok({"id": notification_id, "isRead": True})


@router.post("/read-all")
def mark_all_read(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    execute(db, """
        UPDATE notifications
        SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
        WHERE recipient_user_id = :userId AND is_read = FALSE
    """, {"userId": user["id"]})
    db.commit()
    return ok({"success": True})
