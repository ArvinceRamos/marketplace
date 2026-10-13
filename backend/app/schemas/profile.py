import uuid
from datetime import datetime
from typing import Annotated

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

# Lowercase first, then check the pattern (Pydantic checks patterns before to_lower).
Username = Annotated[
    str,
    BeforeValidator(lambda v: v.strip().lower() if isinstance(v, str) else v),
    StringConstraints(pattern=r"^[a-z0-9_.]{3,30}$"),
]
DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
Bio = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class MeResponse(BaseModel):
    id: uuid.UUID
    email: str | None
    username: str
    display_name: str | None
    bio: str | None
    avatar_path: str | None
    city_id: int | None
    age_confirmed: bool
    created_at: datetime


class MeUpdate(BaseModel):
    """Only these fields can be changed. Unknown fields (e.g. `id`) are rejected."""

    model_config = ConfigDict(extra="forbid")

    username: Username | None = None
    display_name: DisplayName | None = None
    bio: Bio | None = None
    city_id: Annotated[int, Field(ge=1, le=32767)] | None = None

    @model_validator(mode="after")
    def _username_cannot_be_cleared(self) -> "MeUpdate":
        if "username" in self.model_fields_set and self.username is None:
            raise ValueError("username cannot be empty")
        return self
