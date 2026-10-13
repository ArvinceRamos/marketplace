from datetime import datetime

from pydantic import BaseModel

from app.schemas.catalog import SellerSummary


class FollowedSeller(SellerSummary):
    followed_at: datetime


class FollowState(BaseModel):
    following: bool
