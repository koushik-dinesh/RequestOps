from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.schemas.common import CamelModel


class RegisterPayload(CamelModel):
    fullName: str = Field(min_length=2)
    employeeId: str = Field(min_length=2)
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
    roiEmployeesBenefited: int | None = Field(default=None, ge=0)
    roiMonthlyCostSavingsInr: float | None = Field(default=None, ge=0)


class RequestDetailsPayload(CamelModel):
    title: str = Field(min_length=5)
    businessJustification: str = Field(min_length=5)
    description: str = Field(min_length=10)
    expectedBenefits: str | None = None


class RoiPayload(CamelModel):
    roiType: Literal["TIME_SAVINGS", "COST_SAVINGS"] | None = None
    roiHoursSavedPerEmployeePerMonth: float | None = Field(default=None, ge=0)
    roiEmployeesBenefited: int | None = Field(default=None, ge=0)
    roiMonthlyCostSavingsInr: float | None = Field(default=None, ge=0)


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


class AssignPayload(CamelModel):
    developerUserId: int = Field(gt=0)
    qaUserId: int = Field(gt=0)
    notes: str | None = None


class TestResultPayload(CamelModel):
    result: Literal["PASS", "FAIL", "RETEST_REQUIRED"]
    testSummary: str = Field(min_length=3)
    defectsFound: str | None = None


class UatApprovePayload(CamelModel):
    comments: str | None = None


class UatRejectPayload(CamelModel):
    comments: str = Field(min_length=3)
