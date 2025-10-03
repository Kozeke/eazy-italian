from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings
from app.models.user import User
from app.models.task import Task, TaskSubmission
from app.models.email import EmailCampaign, EmailLog, EmailStatus
from app.models.unit import Unit
import json
import logging

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self, db: Session):
        self.db = db
    
    def send_email(self, to_email: str, subject: str, body: str, html_body: Optional[str] = None) -> bool:
        """Send email using SMTP"""
        try:
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = settings.SMTP_USER
            msg['To'] = to_email
            
            # Add plain text and HTML parts
            text_part = MIMEText(body, 'plain', 'utf-8')
            msg.attach(text_part)
            
            if html_body:
                html_part = MIMEText(html_body, 'html', 'utf-8')
                msg.attach(html_part)
            
            # Send email
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                if settings.SMTP_TLS:
                    server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)
            
            logger.info(f"Email sent successfully to {to_email}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            return False
    
    def log_email(self, campaign_id: int, recipient_id: int, status: EmailStatus, error_msg: Optional[str] = None) -> EmailLog:
        """Log email attempt"""
        email_log = EmailLog(
            campaign_id=campaign_id,
            recipient_id=recipient_id,
            status=status,
            error_msg=error_msg
        )
        self.db.add(email_log)
        self.db.commit()
        return email_log
    
    def send_task_assignment_notification(self, task: Task, student_ids: List[int]) -> bool:
        """Send assignment notification to students"""
        if not task.send_assignment_email:
            return True
        
        # Create email campaign
        campaign = EmailCampaign(
            title=f"Assignment Notification: {task.title}",
            template_type="task_assignment",
            subject=f"Новое задание: {task.title}",
            body_rich=self._generate_assignment_email_body(task),
            audience_filter={"student_ids": student_ids},
            created_by=task.created_by
        )
        self.db.add(campaign)
        self.db.commit()
        
        # Send to each student
        students = self.db.query(User).filter(User.id.in_(student_ids)).all()
        success_count = 0
        
        for student in students:
            try:
                # Personalize email for each student
                personalized_body = self._personalize_assignment_email(task, student)
                
                success = self.send_email(
                    to_email=student.email,
                    subject=campaign.subject,
                    body=personalized_body,
                    html_body=personalized_body
                )
                
                status = EmailStatus.SENT if success else EmailStatus.FAILED
                error_msg = None if success else "SMTP error"
                
                self.log_email(campaign.id, student.id, status, error_msg)
                
                if success:
                    success_count += 1
                    
            except Exception as e:
                logger.error(f"Failed to send assignment email to {student.email}: {str(e)}")
                self.log_email(campaign.id, student.id, EmailStatus.FAILED, str(e))
        
        # Update campaign status
        campaign.status = "sent" if success_count > 0 else "failed"
        self.db.commit()
        
        return success_count > 0
    
    def send_task_reminder(self, task: Task, student_ids: List[int]) -> bool:
        """Send reminder email to students"""
        if not task.reminder_days_before:
            return True
        
        # Create email campaign
        campaign = EmailCampaign(
            title=f"Reminder: {task.title}",
            template_type="task_reminder",
            subject=f"Напоминание: {task.title}",
            body_rich=self._generate_reminder_email_body(task),
            audience_filter={"student_ids": student_ids},
            created_by=task.created_by
        )
        self.db.add(campaign)
        self.db.commit()
        
        # Send to each student
        students = self.db.query(User).filter(User.id.in_(student_ids)).all()
        success_count = 0
        
        for student in students:
            try:
                personalized_body = self._personalize_reminder_email(task, student)
                
                success = self.send_email(
                    to_email=student.email,
                    subject=campaign.subject,
                    body=personalized_body,
                    html_body=personalized_body
                )
                
                status = EmailStatus.SENT if success else EmailStatus.FAILED
                error_msg = None if success else "SMTP error"
                
                self.log_email(campaign.id, student.id, status, error_msg)
                
                if success:
                    success_count += 1
                    
            except Exception as e:
                logger.error(f"Failed to send reminder email to {student.email}: {str(e)}")
                self.log_email(campaign.id, student.id, EmailStatus.FAILED, str(e))
        
        campaign.status = "sent" if success_count > 0 else "failed"
        self.db.commit()
        
        return success_count > 0
    
    def send_submission_notification_to_teacher(self, submission: TaskSubmission) -> bool:
        """Send notification to teacher when student submits"""
        if not submission.task.notify_teacher_on_submit:
            return True
        
        teacher = self.db.query(User).filter(User.id == submission.task.created_by).first()
        if not teacher:
            return False
        
        # Create email campaign
        campaign = EmailCampaign(
            title=f"New Submission: {submission.task.title}",
            template_type="submission_notification",
            subject=f"Новая сдача: {submission.task.title}",
            body_rich=self._generate_submission_notification_body(submission),
            audience_filter={"teacher_id": teacher.id},
            created_by=submission.task.created_by
        )
        self.db.add(campaign)
        self.db.commit()
        
        try:
            success = self.send_email(
                to_email=teacher.email,
                subject=campaign.subject,
                body=campaign.body_rich,
                html_body=campaign.body_rich
            )
            
            status = EmailStatus.SENT if success else EmailStatus.FAILED
            error_msg = None if success else "SMTP error"
            
            self.log_email(campaign.id, teacher.id, status, error_msg)
            
            campaign.status = "sent" if success else "failed"
            self.db.commit()
            
            return success
            
        except Exception as e:
            logger.error(f"Failed to send submission notification to {teacher.email}: {str(e)}")
            self.log_email(campaign.id, teacher.id, EmailStatus.FAILED, str(e))
            campaign.status = "failed"
            self.db.commit()
            return False
    
    def send_grade_notification_to_student(self, submission: TaskSubmission) -> bool:
        """Send grade notification to student"""
        if not submission.task.notify_student_on_grade:
            return True
        
        student = self.db.query(User).filter(User.id == submission.student_id).first()
        if not student:
            return False
        
        # Create email campaign
        campaign = EmailCampaign(
            title=f"Grade Published: {submission.task.title}",
            template_type="grade_notification",
            subject=f"Оценка опубликована: {submission.task.title}",
            body_rich=self._generate_grade_notification_body(submission),
            audience_filter={"student_id": student.id},
            created_by=submission.task.created_by
        )
        self.db.add(campaign)
        self.db.commit()
        
        try:
            success = self.send_email(
                to_email=student.email,
                subject=campaign.subject,
                body=campaign.body_rich,
                html_body=campaign.body_rich
            )
            
            status = EmailStatus.SENT if success else EmailStatus.FAILED
            error_msg = None if success else "SMTP error"
            
            self.log_email(campaign.id, student.id, status, error_msg)
            
            campaign.status = "sent" if success else "failed"
            self.db.commit()
            
            return success
            
        except Exception as e:
            logger.error(f"Failed to send grade notification to {student.email}: {str(e)}")
            self.log_email(campaign.id, student.id, EmailStatus.FAILED, str(e))
            campaign.status = "failed"
            self.db.commit()
            return False
    
    def _generate_assignment_email_body(self, task: Task) -> str:
        """Generate assignment email body"""
        unit_title = task.unit.title if task.unit else "Без юнита"
        due_date = task.due_at.strftime("%d.%m.%Y %H:%M") if task.due_at else "Не указан"
        
        return f"""
        <h2>Новое задание: {task.title}</h2>
        <p><strong>Юнит:</strong> {unit_title}</p>
        <p><strong>Описание:</strong> {task.description or 'Не указано'}</p>
        <p><strong>Инструкции:</strong> {task.instructions or 'Не указаны'}</p>
        <p><strong>Максимальный балл:</strong> {task.max_score}</p>
        <p><strong>Срок сдачи:</strong> {due_date}</p>
        <p><strong>Тип задания:</strong> {task.type.value}</p>
        
        <p>Перейдите в систему для выполнения задания.</p>
        """
    
    def _personalize_assignment_email(self, task: Task, student: User) -> str:
        """Personalize assignment email for specific student"""
        base_body = self._generate_assignment_email_body(task)
        return f"""
        <p>Здравствуйте, {student.first_name}!</p>
        {base_body}
        <p>С уважением,<br>Команда Eazy Italian</p>
        """
    
    def _generate_reminder_email_body(self, task: Task) -> str:
        """Generate reminder email body"""
        unit_title = task.unit.title if task.unit else "Без юнита"
        due_date = task.due_at.strftime("%d.%m.%Y %H:%M") if task.due_at else "Не указан"
        
        return f"""
        <h2>Напоминание о задании: {task.title}</h2>
        <p><strong>Юнит:</strong> {unit_title}</p>
        <p><strong>Срок сдачи:</strong> {due_date}</p>
        <p><strong>Максимальный балл:</strong> {task.max_score}</p>
        
        <p>Не забудьте сдать задание вовремя!</p>
        """
    
    def _personalize_reminder_email(self, task: Task, student: User) -> str:
        """Personalize reminder email for specific student"""
        base_body = self._generate_reminder_email_body(task)
        return f"""
        <p>Здравствуйте, {student.first_name}!</p>
        {base_body}
        <p>С уважением,<br>Команда Eazy Italian</p>
        """
    
    def _generate_submission_notification_body(self, submission: TaskSubmission) -> str:
        """Generate submission notification body for teacher"""
        student_name = f"{submission.student.first_name} {submission.student.last_name}"
        submitted_at = submission.submitted_at.strftime("%d.%m.%Y %H:%M") if submission.submitted_at else "Не указано"
        
        return f"""
        <h2>Новая сдача задания</h2>
        <p><strong>Задание:</strong> {submission.task.title}</p>
        <p><strong>Студент:</strong> {student_name}</p>
        <p><strong>Email студента:</strong> {submission.student.email}</p>
        <p><strong>Время сдачи:</strong> {submitted_at}</p>
        <p><strong>Попытка:</strong> {submission.attempt_number}</p>
        
        <p>Перейдите в систему для проверки работы.</p>
        """
    
    def _generate_grade_notification_body(self, submission: TaskSubmission) -> str:
        """Generate grade notification body for student"""
        task_title = submission.task.title
        score = submission.score or 0
        max_score = submission.task.max_score
        feedback = submission.feedback_rich or "Обратная связь не предоставлена"
        graded_at = submission.graded_at.strftime("%d.%m.%Y %H:%M") if submission.graded_at else "Не указано"
        
        return f"""
        <h2>Оценка опубликована</h2>
        <p><strong>Задание:</strong> {task_title}</p>
        <p><strong>Ваш балл:</strong> {score}/{max_score}</p>
        <p><strong>Обратная связь:</strong></p>
        <div>{feedback}</div>
        <p><strong>Дата проверки:</strong> {graded_at}</p>
        
        <p>Перейдите в систему для просмотра подробностей.</p>
        """
    
    def schedule_reminder(self, task: Task, reminder_offset: str) -> bool:
        """Schedule a reminder email for a task"""
        if not task.due_at:
            return False
        
        # Parse reminder offset (e.g., "2 days", "48 hours")
        try:
            if "days" in reminder_offset:
                days = int(reminder_offset.split()[0])
                reminder_time = task.due_at - timedelta(days=days)
            elif "hours" in reminder_offset:
                hours = int(reminder_offset.split()[0])
                reminder_time = task.due_at - timedelta(hours=hours)
            else:
                return False
        except:
            return False
        
        # Create scheduled campaign
        campaign = EmailCampaign(
            title=f"Reminder: {task.title}",
            template_type="task_reminder",
            subject=f"Напоминание: {task.title}",
            body_rich=self._generate_reminder_email_body(task),
            audience_filter={"task_id": task.id},
            schedule_at=reminder_time,
            status="scheduled",
            created_by=task.created_by
        )
        self.db.add(campaign)
        self.db.commit()
        
        return True

