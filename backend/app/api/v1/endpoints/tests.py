from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.auth import get_current_user, get_current_teacher
from app.models.user import User
from app.models.test import Test
from app.schemas.test import TestResponse

router = APIRouter()

@router.get("/", response_model=List[TestResponse])
def get_tests(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    tests = db.query(Test).offset(skip).limit(limit).all()
    return tests
