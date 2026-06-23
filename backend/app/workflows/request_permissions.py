"""Request ownership permissions without workflow/audit dependencies."""

NON_WITHDRAWABLE_STATUSES = frozenset({
    "CLOSED",
    "DEPARTMENT_REJECTED",
    "IT_REJECTED",
    "WITHDRAWN",
})


def can_requester_withdraw(request_row: dict, user_id: int) -> bool:
    if int(request_row.get("requester_user_id") or 0) != int(user_id):
        return False
    return request_row.get("status") not in NON_WITHDRAWABLE_STATUSES
