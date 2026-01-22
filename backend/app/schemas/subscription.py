from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ChangeSubscriptionRequest(BaseModel):
    subscription: str  # free | premium | pro
    ends_at: Optional[datetime] = None
