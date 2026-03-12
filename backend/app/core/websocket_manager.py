"""
WebSocket connection manager for live sessions
"""
from typing import Dict, Set
from fastapi import WebSocket
import json
import logging

logger = logging.getLogger(__name__)


class LiveSessionManager:
    """Manages WebSocket connections for live classroom sessions"""
    
    def __init__(self):
        # Map: classroom_id -> Set[WebSocket]
        self.classroom_connections: Dict[int, Set[WebSocket]] = {}
        # Map: WebSocket -> (classroom_id, user_id, role)
        self.connection_info: Dict[WebSocket, tuple] = {}
    
    async def connect(self, websocket: WebSocket, classroom_id: int, user_id: int, role: str):
        """Connect a client to a classroom"""
        await websocket.accept()
        
        if classroom_id not in self.classroom_connections:
            self.classroom_connections[classroom_id] = set()
        
        self.classroom_connections[classroom_id].add(websocket)
        self.connection_info[websocket] = (classroom_id, user_id, role)
        
        logger.info(f"User {user_id} ({role}) connected to classroom {classroom_id}")
        
        # Notify other clients (for student count updates)
        await self.broadcast_student_count(classroom_id)
    
    def disconnect(self, websocket: WebSocket):
        """Disconnect a client"""
        if websocket not in self.connection_info:
            return
        
        classroom_id, user_id, role = self.connection_info[websocket]
        del self.connection_info[websocket]
        
        if classroom_id in self.classroom_connections:
            self.classroom_connections[classroom_id].discard(websocket)
            if not self.classroom_connections[classroom_id]:
                del self.classroom_connections[classroom_id]
        
        logger.info(f"User {user_id} ({role}) disconnected from classroom {classroom_id}")
        
        # Notify other clients (for student count updates)
        # Note: We can't use await here, so we'll handle it in the endpoint
    
    async def broadcast_to_classroom(self, classroom_id: int, event: str, payload: dict):
        """Broadcast a message to all connected clients in a classroom"""
        if classroom_id not in self.classroom_connections:
            return
        
        message = {
            "event": event,
            "payload": payload
        }
        message_json = json.dumps(message)
        
        disconnected = set()
        for websocket in self.classroom_connections[classroom_id]:
            try:
                await websocket.send_text(message_json)
            except Exception as e:
                logger.warning(f"Failed to send message to client: {e}")
                disconnected.add(websocket)
        
        # Clean up disconnected clients
        for ws in disconnected:
            self.disconnect(ws)
    
    async def broadcast_student_count(self, classroom_id: int):
        """Broadcast updated student count to teacher"""
        if classroom_id not in self.classroom_connections:
            return
        
        # Count students (exclude teachers)
        student_count = sum(
            1 for ws in self.classroom_connections[classroom_id]
            if ws in self.connection_info and self.connection_info[ws][2] == "student"
        )
        
        # Send to teacher only
        for websocket in self.classroom_connections[classroom_id]:
            if websocket in self.connection_info:
                _, _, role = self.connection_info[websocket]
                if role == "teacher":
                    try:
                        await websocket.send_text(json.dumps({
                            "event": "STUDENT_COUNT_UPDATED",
                            "payload": {"student_count": student_count}
                        }))
                    except Exception:
                        pass
    
    def get_student_count(self, classroom_id: int) -> int:
        """Get the number of connected students"""
        if classroom_id not in self.classroom_connections:
            return 0
        
        return sum(
            1 for ws in self.classroom_connections[classroom_id]
            if ws in self.connection_info and self.connection_info[ws][2] == "student"
        )


# Global instance
live_session_manager = LiveSessionManager()
