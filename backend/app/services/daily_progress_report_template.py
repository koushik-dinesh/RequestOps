"""Executive dashboard HTML template for the Daily Activity / Progress Report email."""

from html import escape

# RequestOps branding palette (email-safe inline styles)
BRAND = {
    "primary": "#0f172a",
    "primaryLight": "#1e293b",
    "accent": "#2563eb",
    "accentLight": "#dbeafe",
    "accentSoft": "#eff6ff",
    "bg": "#f1f5f9",
    "card": "#ffffff",
    "cardMuted": "#f8fafc",
    "border": "#e2e8f0",
    "borderSoft": "#dbe4f0",
    "text": "#334155",
    "textMuted": "#64748b",
    "textDark": "#0f172a",
    "green": "#16a34a",
    "greenBg": "#dcfce7",
    "blue": "#2563eb",
    "blueBg": "#dbeafe",
    "orange": "#d97706",
    "orangeBg": "#fef3c7",
    "red": "#dc2626",
    "redBg": "#fef2f2",
    "purple": "#7c3aed",
    "purpleBg": "#ede9fe",
}


def _status_badge_category(status: str | None) -> str:
    """Map workflow status to executive badge category."""
    value = (status or "").upper()
    if value == "CLOSED":
        return "closed"
    if value in {"UAT_PENDING", "UAT_FAILED", "UAT_APPROVED", "UAT_REJECTED", "IN_TESTING", "TEST_FAILED"}:
        return "uat"
    if value in {"DEPLOYMENT_PENDING", "DEPLOYED", "READY_FOR_COMPLETION"}:
        return "deployment"
    if value in {
        "SPRINT_ACTIVE", "IN_DEVELOPMENT", "DEVELOPMENT_COMPLETE",
        "QA_PENDING", "QA_FAILED", "QA_PASSED", "ASSIGNED", "DEVELOPER_ASSIGNED",
    }:
        return "in_progress"
    if value in {"DEPARTMENT_REJECTED", "IT_REJECTED", "DEFERRED"}:
        return "overdue"
    return "open"


BADGE_STYLES = {
    "open": (BRAND["blue"], BRAND["blueBg"]),
    "in_progress": (BRAND["accent"], BRAND["accentSoft"]),
    "uat": (BRAND["orange"], BRAND["orangeBg"]),
    "deployment": (BRAND["purple"], BRAND["purpleBg"]),
    "closed": (BRAND["green"], BRAND["greenBg"]),
    "overdue": (BRAND["red"], BRAND["redBg"]),
}


def status_badge_html(status_label: str, status_code: str | None = None, overdue: bool = False) -> str:
    category = "overdue" if overdue else _status_badge_category(status_code)
    color, bg = BADGE_STYLES.get(category, BADGE_STYLES["open"])
    return (
        f'<span style="display:inline-block;padding:4px 10px;border-radius:999px;'
        f'background:{bg};color:{color};font-size:11px;font-weight:800;'
        f'letter-spacing:.3px;white-space:nowrap;">{escape(status_label)}</span>'
    )


def _kpi_card(label: str, value: int | str, accent: str = BRAND["accent"]) -> str:
    return f"""
    <td class="kpi-cell" style="width:33.33%;padding:6px;vertical-align:top;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;">
        <tr>
          <td style="border:1px solid {BRAND['borderSoft']};border-radius:14px;padding:16px 14px;background:{BRAND['card']};box-shadow:0 4px 14px rgba(15,23,42,.06);">
            <div style="font-size:10px;color:{BRAND['textMuted']};font-weight:800;text-transform:uppercase;letter-spacing:.6px;line-height:1.3;">{escape(label)}</div>
            <div style="margin-top:10px;font-size:28px;line-height:1;font-weight:900;color:{BRAND['textDark']};">{escape(str(value))}</div>
            <div style="margin-top:8px;width:32px;height:3px;border-radius:999px;background:{accent};"></div>
          </td>
        </tr>
      </table>
    </td>
    """


def _kpi_grid(cards: list[tuple[str, int | str]], accent_colors: list[str] | None = None) -> str:
    if not cards:
        return _empty_state("No metrics available.")
    accents = accent_colors or [BRAND["accent"]] * len(cards)
    cells = [_kpi_card(label, value, accent) for (label, value), accent in zip(cards, accents, strict=False)]
    rows = []
    for index in range(0, len(cells), 3):
        chunk = cells[index:index + 3]
        while len(chunk) < 3:
            chunk.append('<td class="kpi-cell" style="width:33.33%;padding:6px;"></td>')
        rows.append(f"<tr>{''.join(chunk)}</tr>")
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      {''.join(rows)}
    </table>
    """


def _section_header(title: str, subtitle: str = "") -> str:
    subtitle_html = (
        f'<div style="margin-top:4px;font-size:12px;color:{BRAND["textMuted"]};line-height:1.5;">{escape(subtitle)}</div>'
        if subtitle else ""
    )
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:28px 0 12px;">
      <tr>
        <td style="padding-bottom:8px;border-bottom:2px solid {BRAND['border']};">
          <div style="font-size:16px;font-weight:900;color:{BRAND['textDark']};letter-spacing:.2px;">{escape(title)}</div>
          {subtitle_html}
        </td>
      </tr>
    </table>
    """


def _empty_state(message: str) -> str:
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="padding:18px;border:1px dashed {BRAND['border']};border-radius:12px;background:{BRAND['cardMuted']};color:{BRAND['textMuted']};font-size:13px;text-align:center;">
          {escape(message)}
        </td>
      </tr>
    </table>
    """


def _render_report_header(payload: dict) -> str:
    report_date = payload.get("reportDateLabel") or payload.get("reportDate", "-")
    generated_at = payload.get("generatedAtLabel") or payload.get("generatedAt", "-")
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:8px;">
      <tr>
        <td style="padding:20px 22px;border-radius:16px;background:linear-gradient(135deg,{BRAND['primary']} 0%,{BRAND['primaryLight']} 100%);">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="vertical-align:middle;">
                <div style="font-size:22px;line-height:1.2;font-weight:900;color:#ffffff;letter-spacing:.3px;">RequestOps</div>
                <div style="margin-top:4px;font-size:12px;color:#bfdbfe;font-weight:700;letter-spacing:.8px;text-transform:uppercase;">Daily Activity Report</div>
              </td>
              <td align="right" style="vertical-align:middle;">
                <div style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.6px;">Report Date</div>
                <div style="margin-top:4px;font-size:15px;color:#ffffff;font-weight:800;">{escape(report_date)}</div>
                <div style="margin-top:10px;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.6px;">Generated</div>
                <div style="margin-top:4px;font-size:13px;color:#e2e8f0;font-weight:700;">{escape(generated_at)}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    """


def _render_overall_status(payload: dict) -> str:
    data = payload.get("overallStatus") or {}
    cards = [
        ("Total Requests", data.get("totalRequests", 0), BRAND["primary"]),
        ("Open Requests", data.get("openRequests", 0), BRAND["blue"]),
        ("In Progress", data.get("inProgressRequests", 0), BRAND["accent"]),
        ("Completed", data.get("completedRequests", 0), BRAND["green"]),
        ("Closed (Sign-Off)", data.get("closedRequests", 0), BRAND["green"]),
    ]
    cells = [_kpi_card(label, value, accent) for label, value, accent in cards]
    row1 = cells[:3]
    row2 = cells[3:]
    while len(row2) < 3:
        row2.append('<td class="kpi-cell" style="width:33.33%;padding:6px;"></td>')
    return (
        _section_header("Overall Request Status", "System-wide request pipeline snapshot")
        + f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>{"".join(row1)}</tr><tr>{"".join(row2)}</tr></table>'
    )


def _render_daily_summary(payload: dict) -> str:
    data = payload.get("dailySummary") or {}
    cards = [
        ("New Submitted", data.get("newRequestsSubmitted", 0), BRAND["blue"]),
        ("Approved", data.get("requestsApproved", 0), BRAND["green"]),
        ("Assigned", data.get("requestsAssigned", 0), BRAND["accent"]),
        ("Completed", data.get("requestsCompleted", 0), BRAND["green"]),
        ("Closed (Sign-Off)", data.get("requestsClosed", 0), BRAND["purple"]),
    ]
    cells = [_kpi_card(label, value, accent) for label, value, accent in cards]
    row1 = cells[:3]
    row2 = cells[3:]
    while len(row2) < 3:
        row2.append('<td class="kpi-cell" style="width:33.33%;padding:6px;"></td>')
    return (
        _section_header("Daily Summary", "Activity recorded for the report date")
        + f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>{"".join(row1)}</tr><tr>{"".join(row2)}</tr></table>'
    )


def _render_sprint_activity_cards(items: list[dict]) -> str:
    if not items:
        return _empty_state("No request activity recorded today.")
    cards = []
    for item in items:
        badge = status_badge_html(item.get("statusLabel") or "-", item.get("status"))
        completed = item.get("completedDate") or "-"
        remarks = item.get("remarks") or ""
        remarks_html = (
            f'<div style="margin-top:10px;padding:10px 12px;border-radius:10px;background:{BRAND["cardMuted"]};font-size:12px;color:{BRAND["text"]};line-height:1.5;"><strong style="color:{BRAND["textDark"]};">Remarks:</strong> {escape(remarks)}</div>'
            if remarks else ""
        )
        cards.append(f"""
        <tr>
          <td style="padding:0 0 12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;">
              <tr>
                <td style="border:1px solid {BRAND['borderSoft']};border-radius:14px;padding:16px;background:{BRAND['card']};box-shadow:0 3px 12px rgba(15,23,42,.05);">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                    <tr>
                      <td style="vertical-align:top;">
                        <div style="font-size:11px;color:{BRAND['accent']};font-weight:800;letter-spacing:.4px;">{escape(item.get('requestId') or '-')}</div>
                        <div style="margin-top:4px;font-size:15px;font-weight:900;color:{BRAND['textDark']};line-height:1.35;">{escape(item.get('title') or '-')}</div>
                      </td>
                      <td align="right" style="vertical-align:top;white-space:nowrap;padding-left:8px;">{badge}</td>
                    </tr>
                  </table>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:12px;">
                    <tr>
                      <td style="width:50%;padding:6px 8px 6px 0;vertical-align:top;">
                        <div style="font-size:10px;color:{BRAND['textMuted']};font-weight:800;text-transform:uppercase;letter-spacing:.5px;">Target Date</div>
                        <div style="margin-top:4px;font-size:13px;font-weight:700;color:{BRAND['textDark']};">{escape(item.get('targetDate') or '-')}</div>
                      </td>
                      <td style="width:50%;padding:6px 0 6px 8px;vertical-align:top;">
                        <div style="font-size:10px;color:{BRAND['textMuted']};font-weight:800;text-transform:uppercase;letter-spacing:.5px;">Completed Date</div>
                        <div style="margin-top:4px;font-size:13px;font-weight:700;color:{BRAND['textDark']};">{escape(completed)}</div>
                      </td>
                    </tr>
                  </table>
                  {remarks_html}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        """)
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">{"".join(cards)}</table>'


def _render_activity_timeline(items: list[dict]) -> str:
    if not items:
        return _empty_state("No status changes recorded today.")
    rows = []
    total = len(items)
    for index, item in enumerate(items):
        is_last = index == total - 1
        connector = "" if is_last else f'<div style="width:2px;height:100%;min-height:24px;background:{BRAND["border"]};margin:0 auto;"></div>'
        badge = status_badge_html(item.get("statusLabel") or item.get("eventLabel") or "-", item.get("toStatus"))
        detail = item.get("detail") or ""
        detail_html = f'<div style="margin-top:6px;font-size:12px;color:{BRAND["text"]};line-height:1.5;">{escape(detail)}</div>' if detail else ""
        rows.append(f"""
        <tr>
          <td style="width:28px;vertical-align:top;padding:0 10px 0 0;">
            <div style="width:12px;height:12px;border-radius:999px;background:{BRAND['accent']};border:3px solid {BRAND['accentSoft']};margin:4px auto 0;"></div>
            {connector}
          </td>
          <td style="vertical-align:top;padding:0 0 {'' if is_last else '18px'} 0;">
            <div style="font-size:11px;color:{BRAND['textMuted']};font-weight:700;">{escape(item.get('occurredAt') or '-')}</div>
            <div style="margin-top:6px;">{badge}</div>
            <div style="margin-top:6px;font-size:13px;font-weight:800;color:{BRAND['textDark']};">{escape(item.get('requestId') or '-')} &mdash; {escape(item.get('title') or '-')}</div>
            <div style="margin-top:4px;font-size:12px;color:{BRAND['textMuted']};">{escape(item.get('actor') or 'System')}</div>
            {detail_html}
          </td>
        </tr>
        """)
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid {BRAND['borderSoft']};border-radius:14px;padding:16px;background:{BRAND['card']};">
      <tr><td style="padding:16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">{''.join(rows)}</table></td></tr>
    </table>
    """


def _render_pending_requests_table(items: list[dict]) -> str:
    if not items:
        return _empty_state("No pending requests. All requests are closed.")
    header = f"""
    <tr style="background:{BRAND['cardMuted']};">
      <th align="left" style="padding:10px 12px;color:{BRAND['textMuted']};font-size:10px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid {BRAND['border']};">Request</th>
      <th align="left" style="padding:10px 12px;color:{BRAND['textMuted']};font-size:10px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid {BRAND['border']};">Status</th>
      <th align="left" style="padding:10px 12px;color:{BRAND['textMuted']};font-size:10px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid {BRAND['border']};">Target</th>
      <th align="left" style="padding:10px 12px;color:{BRAND['textMuted']};font-size:10px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid {BRAND['border']};">Developer</th>
      <th align="left" style="padding:10px 12px;color:{BRAND['textMuted']};font-size:10px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid {BRAND['border']};">Due</th>
    </tr>
    """
    body_rows = []
    for item in items:
        overdue = bool(item.get("isOverdue"))
        due_label = item.get("dueIndicator") or "-"
        due_color = BRAND["red"] if overdue else (BRAND["orange"] if item.get("dueToday") else BRAND["green"])
        due_badge = (
            f'<span style="display:inline-block;padding:3px 8px;border-radius:999px;background:{BRAND["redBg"] if overdue else BRAND["orangeBg"]};'
            f'color:{due_color};font-size:11px;font-weight:800;">{escape(due_label)}</span>'
        )
        body_rows.append(f"""
        <tr>
          <td style="padding:12px;border-bottom:1px solid {BRAND['border']};vertical-align:top;">
            <div style="font-weight:900;color:{BRAND['textDark']};font-size:13px;">{escape(item.get('requestId') or '-')}</div>
            <div style="margin-top:3px;color:{BRAND['text']};font-size:12px;line-height:1.4;">{escape(item.get('title') or '-')}</div>
          </td>
          <td style="padding:12px;border-bottom:1px solid {BRAND['border']};vertical-align:top;">{status_badge_html(item.get('statusLabel') or '-', item.get('status'), overdue=overdue)}</td>
          <td style="padding:12px;border-bottom:1px solid {BRAND['border']};vertical-align:top;font-size:12px;font-weight:700;color:{BRAND['textDark']};">{escape(item.get('targetDate') or '-')}</td>
          <td style="padding:12px;border-bottom:1px solid {BRAND['border']};vertical-align:top;font-size:12px;color:{BRAND['text']};">{escape(item.get('assignedDeveloper') or 'Not assigned')}</td>
          <td style="padding:12px;border-bottom:1px solid {BRAND['border']};vertical-align:top;">{due_badge}</td>
        </tr>
        """)
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid {BRAND['borderSoft']};border-radius:14px;overflow:hidden;background:{BRAND['card']};">
      <thead>{header}</thead>
      <tbody>{''.join(body_rows)}</tbody>
    </table>
    """


def _render_sprint_health(data: dict) -> str:
    pct = int(data.get("sprintCompletionPercentage") or 0)
    pct = max(0, min(pct, 100))
    bar_color = BRAND["green"] if pct >= 75 else (BRAND["orange"] if pct >= 40 else BRAND["red"])
    cards = [
        ("Active Sprint Requests", data.get("totalActiveSprintRequests", 0), BRAND["accent"]),
        ("Completed On Time", data.get("completedWithinTargetDate", 0), BRAND["green"]),
        ("Overdue", data.get("overdueRequests", 0), BRAND["red"]),
        ("Due Today", data.get("dueToday", 0), BRAND["orange"]),
        ("Due This Week", data.get("dueThisWeek", 0), BRAND["blue"]),
    ]
    cells = [_kpi_card(label, value, accent) for label, value, accent in cards]
    row1 = cells[:3]
    row2 = cells[3:]
    while len(row2) < 3:
        row2.append('<td class="kpi-cell" style="width:33.33%;padding:6px;"></td>')
    progress = f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:14px;">
      <tr>
        <td style="padding:16px 18px;border:1px solid {BRAND['borderSoft']};border-radius:14px;background:{BRAND['card']};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="font-size:12px;font-weight:800;color:{BRAND['textDark']};">Sprint Completion</td>
              <td align="right" style="font-size:20px;font-weight:900;color:{bar_color};">{pct}%</td>
            </tr>
          </table>
          <div style="margin-top:12px;height:10px;border-radius:999px;background:{BRAND['border']};overflow:hidden;">
            <div style="width:{pct}%;max-width:100%;height:10px;border-radius:999px;background:{bar_color};"></div>
          </div>
        </td>
      </tr>
    </table>
    """
    return (
        _section_header("Sprint Health", "Delivery timeline and completion indicators")
        + f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>{"".join(row1)}</tr><tr>{"".join(row2)}</tr></table>'
        + progress
    )


def _render_footer(payload: dict) -> str:
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:28px;">
      <tr>
        <td style="padding:18px 20px;border-radius:14px;background:{BRAND['cardMuted']};border:1px solid {BRAND['border']};">
          <div style="font-size:12px;color:{BRAND['textMuted']};line-height:1.65;">
            This executive dashboard report is automatically generated from RequestOps workflow, assignment, sprint, and audit data.
            Metrics reflect the state as of <strong style="color:{BRAND['textDark']};">{escape(payload.get('generatedAtLabel') or payload.get('generatedAt', '-'))}</strong>.
          </div>
        </td>
      </tr>
    </table>
    """


def render_report_html(payload: dict) -> str:
    """Render the full executive dashboard report body (embedded in branded email wrapper)."""
    return f"""
    <div style="font-family:Arial,Helvetica,sans-serif;color:{BRAND['text']};">
      <style type="text/css">
        @media only screen and (max-width: 620px) {{
          .kpi-cell {{ display:block !important; width:100% !important; }}
        }}
      </style>
      {_render_report_header(payload)}
      {_render_overall_status(payload)}
      {_render_daily_summary(payload)}
      {_section_header("Daily Sprint Activity", "Requests with recorded activity today")}
      {_render_sprint_activity_cards(payload.get("dailySprintActivity") or [])}
      {_section_header("Activity Log", "Chronological status changes today")}
      {_render_activity_timeline(payload.get("activityLog") or [])}
      {_section_header("Pending Requests", "All non-closed requests requiring attention")}
      {_render_pending_requests_table(payload.get("pendingRequests") or [])}
      {_render_sprint_health(payload.get("sprintHealth") or {})}
      {_render_footer(payload)}
    </div>
    """
