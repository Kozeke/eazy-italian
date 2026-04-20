from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ChangeSubscriptionRequest(BaseModel):
    subscription: str  # free | standard | pro (premium is treated as standard)
    ends_at: Optional[datetime] = None
