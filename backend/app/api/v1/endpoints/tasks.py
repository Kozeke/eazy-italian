from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.auth import get_current_user, get_current_teacher
from app.models.user import User
from app.models.task import Task
from app.schemas.task import TaskResponse

router = APIRouter()

@router.get("/", response_model=List[TaskResponse])
def get_tasks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    tasks = db.query(Task).offset(skip).limit(limit).all()
    return tasks
