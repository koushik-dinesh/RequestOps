from datetime import date
from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.schemas.common import CamelModel


class RegisterPayload(CamelModel):
    fullName: str = Field(min_length=2)
    employeeId: str | None = None
    email: str = Field(min_length=3)
    mobileNumber: str | None = Field(default=None, min_length=5)
    designation: str = Field(min_length=2)
    departmentId: int = Field(gt=0)
    password: str = Field(min_length=8)
    confirmPassword: str = Field(min_length=8)

    @field_validator("email")
    @classmethod
    def valid_email_shape(cls, value: str) -> str:
        if "@" not in value or "." not in value.split("@")[-1]:
            raise ValueError("Invalid email address.")
        return value

    @model_validator(mode="after")
    def passwords_match(self):
        if self.password != self.confirmPassword:
            raise ValueError("Passwords do not match.")
        return self


class LoginPayload(CamelModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=1)

    @field_validator("email")
    @classmethod
    def valid_email_shape(cls, value: str) -> str:
        if "@" not in value or "." not in value.split("@")[-1]:
            raise ValueError("Invalid email address.")
        return value


class RefreshPayload(CamelModel):
    refreshToken: str = Field(min_length=10)


class RegistrationApprovePayload(CamelModel):
    departmentId: int = Field(gt=0)
    roleId: int = Field(gt=0)


class RejectPayload(CamelModel):
    reason: str = Field(min_length=3)


class PasswordPayload(CamelModel):
    password: str = Field(min_length=8)


class DailyProgressReportConfigPayload(CamelModel):
    isEnabled: bool = True
    reportTime: str = Field(default="19:00", pattern=r"^\d{2}:\d{2}$")
    recipientUserIds: list[int] = Field(default_factory=list)
    staleThresholdDays: int = Field(default=3, ge=1, le=90)
    overdueThresholdDays: int = Field(default=7, ge=1, le=365)

    @field_validator("reportTime")
    @classmethod
    def valid_report_time(cls, value: str) -> str:
        hour, minute = value.split(":")
        if int(hour) > 23 or int(minute) > 59:
            raise ValueError("Report time must use 24-hour HH:MM format.")
        return value


class DepartmentPayload(CamelModel):
    name: str | None = Field(default=None, min_length=2)
    code: str | None = Field(default=None, min_length=2, max_length=20)
    description: str | None = None
    departmentHeadUserId: int | None = Field(default=None, gt=0)
    status: Literal["ACTIVE", "INACTIVE"] | None = "ACTIVE"


class DepartmentHeadPayload(CamelModel):
    departmentHeadUserId: int | None = Field(default=None, gt=0)


class UserPatchPayload(CamelModel):
    fullName: str | None = Field(default=None, min_length=2)
    mobileNumber: str | None = None
    designation: str | None = None
    departmentId: int | None = Field(default=None, gt=0)
    reportingManagerUserId: int | None = Field(default=None, gt=0)
    roleId: int | None = Field(default=None, gt=0)
    status: Literal["ACTIVE", "INACTIVE", "PENDING_APPROVAL", "REJECTED"] | None = None


class ReassignResponsibilitiesPayload(CamelModel):
    departmentHeadUserId: int | None = Field(default=None, gt=0)
    currentAssigneeUserId: int | None = Field(default=None, gt=0)
    itHeadUserId: int | None = Field(default=None, gt=0)
    projectManagerUserId: int | None = Field(default=None, gt=0)
    developerUserId: int | None = Field(default=None, gt=0)
    qaUserId: int | None = Field(default=None, gt=0)
    reportingManagerUserId: int | None = Field(default=None, gt=0)


class ChangeRolePayload(CamelModel):
    roleId: int = Field(gt=0)
    replacementDepartmentHeadUserId: int | None = Field(default=None, gt=0)


class ChangeDepartmentPayload(CamelModel):
    departmentId: int = Field(gt=0)
    reportingManagerUserId: int = Field(gt=0)
    replacementDepartmentHeadUserId: int | None = Field(default=None, gt=0)


class ChangeReportingManagerPayload(CamelModel):
    reportingManagerUserId: int = Field(gt=0)


class ReactivatePayload(CamelModel):
    departmentId: int = Field(gt=0)
    roleId: int = Field(gt=0)
    reportingManagerUserId: int = Field(gt=0)


class RequestCreatePayload(CamelModel):
    title: str = Field(min_length=5)
    requestType: Literal["NEW_FEATURE", "ENHANCEMENT", "BUG_FIX", "AUTOMATION", "INTEGRATION", "REPORT", "OTHER"]
    priority: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "MEDIUM"
    businessJustification: str = Field(min_length=5)
    description: str = Field(min_length=10)
    expectedBenefits: str | None = None
    roiType: Literal["TIME_SAVINGS", "COST_SAVINGS"] | None = None
    roiHoursSavedPerEmployeePerMonth: float | None = Field(default=None, ge=0)
    roiUsersImpacted: int | None = Field(default=None, ge=0)
    roiTimeSavedPerTask: float | None = Field(default=None, ge=0)
    roiTimeSavedUnit: Literal["MINUTES", "HOURS"] | None = "MINUTES"
    roiOccurrencesPerMonth: int | None = Field(default=None, ge=0)
    roiEmployeesBenefited: int | None = Field(default=None, ge=0)
    roiEstimatedHourlyCostInr: float | None = Field(default=None, ge=0)
    roiEstimatedRevenueImpactInr: float | None = Field(default=None, ge=0)
    roiBusinessImpactCategory: Literal[
        "PRODUCTIVITY_IMPROVEMENT",
        "COST_REDUCTION",
        "REVENUE_INCREASE",
        "PROCESS_AUTOMATION",
        "COMPLIANCE",
        "QUALITY_IMPROVEMENT",
        "CUSTOMER_SATISFACTION",
    ] | None = None
    roiMonthlyCostSavingsInr: float | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_roi_values(self):
        return self


class RequestDetailsPayload(CamelModel):
    title: str = Field(min_length=5)
    businessJustification: str = Field(min_length=5)
    description: str = Field(min_length=10)
    expectedBenefits: str | None = None


class RoiPayload(CamelModel):
    roiType: Literal["TIME_SAVINGS", "COST_SAVINGS"] | None = None
    roiHoursSavedPerEmployeePerMonth: float | None = Field(default=None, ge=0)
    roiUsersImpacted: int | None = Field(default=None, ge=0)
    roiTimeSavedPerTask: float | None = Field(default=None, ge=0)
    roiTimeSavedUnit: Literal["MINUTES", "HOURS"] | None = "MINUTES"
    roiOccurrencesPerMonth: int | None = Field(default=None, ge=0)
    roiEmployeesBenefited: int | None = Field(default=None, ge=0)
    roiEstimatedHourlyCostInr: float | None = Field(default=None, ge=0)
    roiEstimatedRevenueImpactInr: float | None = Field(default=None, ge=0)
    roiBusinessImpactCategory: Literal[
        "PRODUCTIVITY_IMPROVEMENT",
        "COST_REDUCTION",
        "REVENUE_INCREASE",
        "PROCESS_AUTOMATION",
        "COMPLIANCE",
        "QUALITY_IMPROVEMENT",
        "CUSTOMER_SATISFACTION",
    ] | None = None
    roiMonthlyCostSavingsInr: float | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_roi_values(self):
        return self


class CommentPayload(CamelModel):
    commentText: str = Field(min_length=1)
    commentType: Literal["GENERAL", "CLARIFICATION", "APPROVAL", "REJECTION", "DEVELOPMENT", "TESTING", "UAT"] = "GENERAL"
    isInternal: bool = False


class ClarificationPayload(CamelModel):
    reasonCategory: Literal[
        "MISSING_BUSINESS_JUSTIFICATION",
        "MISSING_REQUIREMENTS",
        "MISSING_BENEFITS",
        "MISSING_ATTACHMENT",
        "TECHNICAL_CLARIFICATION",
        "OTHER",
    ]
    note: str = Field(min_length=5)


class ClarificationResponsePayload(CamelModel):
    comment: str = Field(min_length=3)


class OptionalCommentPayload(CamelModel):
    comment: str | None = None


class RequiredCommentPayload(CamelModel):
    comment: str = Field(min_length=3)


class ItReviewApprovePayload(CamelModel):
    feasibilityNotes: str = Field(min_length=3)
    complexity: Literal["LOW", "MEDIUM", "HIGH", "VERY_HIGH"]
    estimatedEffort: str = Field(min_length=1)
    priorityConfirmation: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    comment: str | None = None


class ProjectManagerAssignPayload(CamelModel):
    projectManagerUserId: int = Field(gt=0)
    notes: str | None = None


class ProjectScopePayload(CamelModel):
    scopeTitle: str = Field(min_length=3, max_length=255)
    scopeDescription: str | None = None
    businessObjectives: str | None = None
    inScope: str | None = None
    outOfScope: str | None = None
    status: Literal["DRAFT", "SUBMITTED"] = "DRAFT"
    reviewerComment: str | None = None


class ProjectScopeReviewPayload(CamelModel):
    decision: Literal["APPROVED", "REWORK_REQUIRED"]
    reviewComments: str | None = None


class UserStoryPayload(CamelModel):
    storyKey: str | None = Field(default=None, max_length=80)
    title: str = Field(min_length=3, max_length=255)
    description: str = Field(min_length=10)
    acceptanceCriteria: str = Field(min_length=5)
    priority: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "MEDIUM"
    status: Literal["DRAFT", "SUBMITTED"] = "DRAFT"
    reviewerComment: str | None = None


class RequirementPackageStoryPayload(CamelModel):
    id: int | None = Field(default=None, gt=0)
    storyKey: str | None = Field(default=None, max_length=80)
    title: str | None = Field(default=None, min_length=3, max_length=255)
    description: str | None = Field(default=None, min_length=10)
    acceptanceCriteria: str | None = Field(default=None, min_length=5)
    priority: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "MEDIUM"
    delete: bool = False


class RequirementPackageUpdatePayload(CamelModel):
    scope: ProjectScopePayload
    userStories: list[RequirementPackageStoryPayload]
    changeJustification: str = Field(min_length=3)


class UserStoryReviewPayload(CamelModel):
    decision: Literal["APPROVED", "REWORK_REQUIRED"]
    reviewComments: str | None = None


class SprintPayload(CamelModel):
    sprintName: str = Field(min_length=2, max_length=180)
    goal: str | None = None
    startDate: date | None = None
    endDate: date | None = None
    estimatedHours: float | None = Field(default=None, ge=0)
    actualHours: float | None = Field(default=None, ge=0)
    notes: str | None = None
    assignedDeveloperUserId: int | None = Field(default=None, gt=0)
    status: Literal["PLANNED", "CREATED"] = "PLANNED"

    @field_validator("endDate")
    @classmethod
    def end_date_must_be_after_today(cls, value: date | None) -> date | None:
        if value is not None and value <= date.today():
            raise ValueError("Sprint due date must be after today.")
        return value


class SprintTaskPayload(CamelModel):
    taskKey: str | None = Field(default=None, max_length=80)
    userStoryId: int | None = Field(default=None, gt=0)
    title: str = Field(min_length=3, max_length=255)
    description: str | None = None
    assignedDeveloperUserId: int | None = Field(default=None, gt=0)
    estimateHours: float | None = Field(default=None, ge=0)
    actualHours: float | None = Field(default=None, ge=0)
    progressPercentage: int | None = Field(default=None, ge=0, le=100)
    blockedReason: str | None = None
    dueDate: date | None = None
    priority: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "MEDIUM"
    status: Literal["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"] = "TODO"

    @field_validator("dueDate")
    @classmethod
    def due_date_must_be_after_today(cls, value: date | None) -> date | None:
        if value is not None and value <= date.today():
            raise ValueError("Task due date must be after today.")
        return value


class SprintTaskAssignPayload(CamelModel):
    developerUserId: int = Field(gt=0)


class SprintTaskStatusPayload(CamelModel):
    status: Literal["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"]
    actualHours: float | None = Field(default=None, ge=0)
    progressPercentage: int | None = Field(default=None, ge=0, le=100)
    blockedReason: str | None = None
    comment: str | None = None


class SprintTaskBlockerPayload(CamelModel):
    blockerTitle: str = Field(min_length=3, max_length=255)
    description: str = Field(min_length=3)
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "MEDIUM"
    additionalNotes: str | None = None


class SprintTaskCommentPayload(CamelModel):
    commentText: str = Field(min_length=1)
    commentType: Literal["GENERAL", "PROGRESS", "BLOCKER", "COMPLETION"] = "GENERAL"


class AssignPayload(CamelModel):
    developerUserId: int | None = Field(default=None, gt=0)
    qaUserId: int | None = Field(default=None, gt=0)
    notes: str | None = None


class SubmitForQaPayload(CamelModel):
    qaUserId: int = Field(gt=0)
    comment: str | None = None


class QaReworkTaskPayload(CamelModel):
    title: str = Field(min_length=3, max_length=255)
    description: str | None = None
    priority: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "HIGH"


class QaReworkPayload(CamelModel):
    comment: str | None = None
    tasks: list[QaReworkTaskPayload] = Field(min_length=1)


class TestResultPayload(CamelModel):
    result: Literal["PASS", "FAIL", "RETEST_REQUIRED"]
    testSummary: str = Field(min_length=3)
    defectsFound: str | None = None


class UatApprovePayload(CamelModel):
    comments: str | None = None


class UatRejectPayload(CamelModel):
    comments: str = Field(min_length=3)
