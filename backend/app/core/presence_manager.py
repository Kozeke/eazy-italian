"""
app/core/presence_manager.py
─────────────────────────────
In-memory store for the "who is online in this classroom" feature.

Design notes
────────────
• One PresenceManager singleton shared across the process.
• Each classroom keeps a dict  user_id → PresenceEntry  (not a list,
  so duplicate joins from the same user are handled cleanly).
• WebSocket connections are stored alongside the entry so we can
  broadcast targeted messages.
• Heartbeat staleness is tracked via `last_seen`; a background task
  (optional, see evict_stale) can prune ghosts if connections drop
  without sending a proper `close`.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


@dataclass
class PresenceEntry:
    user_id: int
    user_name: str
    avatar_url: Optional[str]
    last_seen: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    # One user may have multiple browser tabs open – store all their sockets
    connections: Set[WebSocket] = field(default_factory=set)

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "user_name": self.user_name,
            "avatar_url": self.avatar_url,
            "last_seen": self.last_seen.isoformat(),
        }


class PresenceManager:
    """
    Thread-safe (asyncio-safe) registry of online users per classroom.

    Public interface
    ────────────────
    join(classroom_id, user_id, user_name, avatar_url, ws)
        → Registers the socket; returns True if this is a *new* user (first tab).

    leave(classroom_id, user_id, ws)
        → Removes the socket; returns True if this was the user's *last* tab.

    heartbeat(classroom_id, user_id)
        → Updates last_seen timestamp.

    get_users(classroom_id)
        → List[dict] snapshot of all online users.

    broadcast(classroom_id, message, exclude_ws=None)
        → Sends a JSON payload to every connected socket in the room,
          optionally skipping one socket (e.g. the sender).

    broadcast_to_teachers(classroom_id, message)
        → Convenience: sends only to sockets whose user_id is in
          self._teachers[classroom_id].  (Teachers register themselves.)

    evict_stale(max_age_seconds=90)
        → Removes entries whose last_seen is older than max_age_seconds.
          Call from a background task if desired.
    """

    def __init__(self) -> None:
        # classroom_id → { user_id → PresenceEntry }
        self._rooms: Dict[int, Dict[int, PresenceEntry]] = {}
        # classroom_id → set of user_ids who are teachers
        self._teachers: Dict[int, Set[int]] = {}
        self._lock = asyncio.Lock()

    # ─── Mutation helpers ────────────────────────────────────────────────────

    async def join(
        self,
        classroom_id: int,
        user_id: int,
        user_name: str,
        avatar_url: Optional[str],
        ws: WebSocket,
        is_teacher: bool = False,
    ) -> bool:
        """
        Register `ws` for `user_id` in `classroom_id`.
        Returns True if this is the user's first connection (i.e. they are
        newly online – useful to trigger `user_joined` broadcast).
        """
        async with self._lock:
            room = self._rooms.setdefault(classroom_id, {})
            is_new = user_id not in room

            if is_new:
                room[user_id] = PresenceEntry(
                    user_id=user_id,
                    user_name=user_name,
                    avatar_url=avatar_url,
                )
            else:
                # Update meta in case name/avatar changed
                entry = room[user_id]
                entry.user_name = user_name
                entry.avatar_url = avatar_url
                entry.last_seen = datetime.now(timezone.utc)

            room[user_id].connections.add(ws)

            if is_teacher:
                self._teachers.setdefault(classroom_id, set()).add(user_id)

            return is_new

    async def leave(
        self,
        classroom_id: int,
        user_id: int,
        ws: WebSocket,
    ) -> bool:
        """
        Remove `ws` from `user_id`'s connection set.
        Returns True if this was the user's last connection (fully offline).
        """
        async with self._lock:
            room = self._rooms.get(classroom_id)
            if not room:
                return False

            entry = room.get(user_id)
            if not entry:
                return False

            entry.connections.discard(ws)

            if entry.connections:
                # Still has other tabs open – not fully offline
                return False

            # Fully offline – clean up
            del room[user_id]
            if not room:
                del self._rooms[classroom_id]

            teachers = self._teachers.get(classroom_id)
            if teachers:
                teachers.discard(user_id)
                if not teachers:
                    del self._teachers[classroom_id]

            return True

    async def heartbeat(self, classroom_id: int, user_id: int) -> None:
        async with self._lock:
            entry = self._rooms.get(classroom_id, {}).get(user_id)
            if entry:
                entry.last_seen = datetime.now(timezone.utc)

    # ─── Queries ─────────────────────────────────────────────────────────────

    async def get_users(self, classroom_id: int) -> List[dict]:
        async with self._lock:
            room = self._rooms.get(classroom_id, {})
            return [e.to_dict() for e in room.values()]

    def get_user_count(self, classroom_id: int) -> int:
        return len(self._rooms.get(classroom_id, {}))

    # ─── Broadcasting ────────────────────────────────────────────────────────

    async def broadcast(
        self,
        classroom_id: int,
        message: dict,
        exclude_ws: Optional[WebSocket] = None,
    ) -> None:
        """Send `message` (as JSON) to every socket in the room."""
        async with self._lock:
            room = self._rooms.get(classroom_id, {})
            all_sockets: List[WebSocket] = []
            for entry in room.values():
                all_sockets.extend(entry.connections)

        payload = json.dumps(message)
        dead: List[WebSocket] = []

        for ws in all_sockets:
            if ws is exclude_ws:
                continue
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)

        # Clean up dead sockets (best-effort, no lock needed here)
        for ws in dead:
            logger.debug("Removing dead socket during broadcast")

    async def broadcast_to_teachers(
        self,
        classroom_id: int,
        message: dict,
    ) -> None:
        """Send only to teacher sockets in the room."""
        async with self._lock:
            teacher_ids = self._teachers.get(classroom_id, set())
            room = self._rooms.get(classroom_id, {})
            sockets: List[WebSocket] = []
            for uid in teacher_ids:
                entry = room.get(uid)
                if entry:
                    sockets.extend(entry.connections)

        payload = json.dumps(message)
        for ws in sockets:
            try:
                await ws.send_text(payload)
            except Exception:
                pass

    async def send_to_user(
        self,
        classroom_id: int,
        user_id: int,
        message: dict,
    ) -> None:
        """Send a message to all sockets belonging to a specific user."""
        async with self._lock:
            entry = self._rooms.get(classroom_id, {}).get(user_id)
            sockets = list(entry.connections) if entry else []

        payload = json.dumps(message)
        for ws in sockets:
            try:
                await ws.send_text(payload)
            except Exception:
                pass

    # ─── Maintenance ─────────────────────────────────────────────────────────

    async def evict_stale(self, max_age_seconds: int = 90) -> int:
        """
        Remove entries whose last heartbeat is older than `max_age_seconds`.
        Returns the number of users evicted.
        Call from a background task, e.g. every 60 s.
        """
        now = datetime.now(timezone.utc)
        evicted = 0

        async with self._lock:
            for classroom_id, room in list(self._rooms.items()):
                stale = [
                    uid
                    for uid, entry in room.items()
                    if (now - entry.last_seen).total_seconds() > max_age_seconds
                ]
                for uid in stale:
                    del room[uid]
                    evicted += 1
                    logger.debug(
                        "Evicted stale user %s from classroom %s", uid, classroom_id
                    )
                if not room:
                    del self._rooms[classroom_id]

        return evicted


# ─── Singleton ────────────────────────────────────────────────────────────────

presence_manager = PresenceManager()