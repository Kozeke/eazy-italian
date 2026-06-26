from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ChangeSubscriptionRequest(BaseModel):
    subscription: str  # free | standard | pro
    ends_at: Optional[datetime] = None
