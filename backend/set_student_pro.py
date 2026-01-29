"""
Script to set student@eazyitalian.com to PRO subscription
Run this script to upgrade the student account to PRO
"""
import sys
import os

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.core.database import engine, SessionLocal
from app.models.user import User
from app.models.subscription import Subscription, UserSubscription, SubscriptionName
from datetime import datetime, timedelta

def set_student_pro():
    """Set student@eazyitalian.com to PRO subscription"""
    db = SessionLocal()
    try:
        # Find the user
        user = db.query(User).filter(User.email == 'student@eazyitalian.com').first()
        if not user:
            print("Error: User with email student@eazyitalian.com not found")
            return
        
        print(f"Found user: {user.email} (ID: {user.id})")
        
        # Find or create PRO subscription
        pro_subscription = db.query(Subscription).filter(
            Subscription.name == SubscriptionName.PRO
        ).first()
        
        if not pro_subscription:
            # Create PRO subscription if it doesn't exist
            pro_subscription = Subscription(
                name=SubscriptionName.PRO,
                price=0.0,
                is_active=True
            )
            db.add(pro_subscription)
            db.commit()
            db.refresh(pro_subscription)
            print("Created PRO subscription")
        else:
            print(f"Found PRO subscription (ID: {pro_subscription.id})")
        
        # Deactivate any existing user subscriptions
        existing_subs = db.query(UserSubscription).filter(
            UserSubscription.user_id == user.id,
            UserSubscription.is_active == True
        ).all()
        
        for sub in existing_subs:
            sub.is_active = False
            sub.ends_at = datetime.utcnow()
        
        # Create new PRO subscription for user
        user_subscription = UserSubscription(
            user_id=user.id,
            subscription_id=pro_subscription.id,
            is_active=True,
            starts_at=datetime.utcnow(),
            ends_at=None  # No expiration for PRO
        )
        db.add(user_subscription)
        
        # Update user's subscription_type to PREMIUM (PRO is treated as premium)
        user.subscription_type = "premium"  # Use string value for enum
        
        db.commit()
        
        print("Successfully set student@eazyitalian.com to PRO subscription!")
        print(f"  - User ID: {user.id}")
        print(f"  - Subscription type: {user.subscription_type}")
        print(f"  - Active subscription: PRO")
        
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    set_student_pro()
