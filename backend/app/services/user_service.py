from sqlalchemy.orm import Session
from app.models.user import User, UserRole
from app.schemas.user import UserUpdate

class UserService:
    def __init__(self, db: Session):
        self.db = db

    def get_user_by_id(self, user_id: int) -> User:
        return self.db.query(User).filter(User.id == user_id).first()

    def get_user_by_email(self, email: str) -> User:
        return self.db.query(User).filter(User.email == email).first()

    def get_students(self, skip: int = 0, limit: int = 100) -> list[User]:
        return self.db.query(User).filter(User.role == UserRole.STUDENT).offset(skip).limit(limit).all()

    def update_user(self, user_id: int, user_update: UserUpdate) -> User:
        user = self.get_user_by_id(user_id)
        if not user:
            raise ValueError("User not found")

        update_data = user_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(user, field, value)

        self.db.commit()
        self.db.refresh(user)
        return user
