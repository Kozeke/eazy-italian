from sqlalchemy.orm import Session
from app.models.subscription import UserSubscription, SubscriptionLevel
from app.models.unit import Unit


def user_can_access_unit(
    db: Session,
    user_id: int,
    unit: Unit
) -> bool:
    return (
        db.query(SubscriptionLevel)
        .join(UserSubscription,
              SubscriptionLevel.subscription_id == UserSubscription.subscription_id)
        .filter(
            UserSubscription.user_id == user_id,
            UserSubscription.is_active == True,
            SubscriptionLevel.level == unit.level.value
        )
        .first()
        is not None
    )
