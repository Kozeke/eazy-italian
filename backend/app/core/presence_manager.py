"""
app/core/presence_manager.py
============================
In-memory classroom presence tracker shared by WebSocket and REST presence endpoints.
"""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket


# Stores a single user entry in a classroom presence map.
@dataclass(slots=True)
class PresenceUser:
    # Stores the user id shown in the teacher presence list.
    user_id: int
    # Stores the display name shown in the teacher presence list.
    user_name: str
    # Stores the optional avatar URL shown in the teacher presence list.
    avatar_url: str | None
    # Tracks active websocket connections for this user in this classroom.
    sockets: set[WebSocket] = field(default_factory=set)
    # Tracks whether at least one of this user's sockets belongs to a teacher.
    is_teacher: bool = False
    # Stores the latest heartbeat timestamp for stale connection eviction.
    last_seen_ts: float = field(default_factory=time.time)


# Coordinates per-classroom online users and teacher broadcasts.
class PresenceManager:
    # Initializes internal state and synchronization primitives.
    def __init__(self) -> None:
        # Protects all mutable presence state from concurrent websocket handlers.
        self._lock = asyncio.Lock()
        # Maps classroom id -> user id -> presence record.
        self._rooms: dict[int, dict[int, PresenceUser]] = {}

    # Adds/updates a user presence record and returns whether the user was newly online.
    async def join(
        self,
        classroom_id: int,
        user_id: int,
        user_name: str,
        avatar_url: str | None,
        ws: WebSocket,
        is_teacher: bool,
    ) -> bool:
        async with self._lock:
            # Creates the room dictionary on first join for this classroom.
            room = self._rooms.setdefault(classroom_id, {})
            # Looks up an existing user record to support multiple open tabs.
            user_presence = room.get(user_id)
            # Tracks whether user becomes online for the first time in this room.
            is_new_user = user_presence is None

            if user_presence is None:
                # Creates a fresh presence record for a newly online user.
                user_presence = PresenceUser(
                    user_id=user_id,
                    user_name=user_name,
                    avatar_url=avatar_url,
                    is_teacher=is_teacher,
                )
                room[user_id] = user_presence
            else:
                # Refreshes metadata if the client sends newer profile fields.
                user_presence.user_name = user_name or user_presence.user_name
                user_presence.avatar_url = avatar_url
                # Preserves teacher visibility if any tab is teacher-authenticated.
                user_presence.is_teacher = user_presence.is_teacher or is_teacher

            # Registers this websocket as one active tab/connection.
            user_presence.sockets.add(ws)
            # Updates freshness for stale-connection eviction logic.
            user_presence.last_seen_ts = time.time()
            return is_new_user

    # Removes a websocket from presence and returns True when the user fully goes offline.
    async def leave(self, classroom_id: int, user_id: int, ws: WebSocket) -> bool:
        async with self._lock:
            # Loads room state if it still exists.
            room = self._rooms.get(classroom_id)
            if not room:
                return False

            # Loads user state if it still exists.
            user_presence = room.get(user_id)
            if not user_presence:
                return False

            # Removes the disconnected websocket from this user record.
            user_presence.sockets.discard(ws)
            # Updates freshness to avoid immediate stale evictions.
            user_presence.last_seen_ts = time.time()

            # If user still has active tabs, they are not offline yet.
            if user_presence.sockets:
                return False

            # Deletes user when no websocket tabs remain.
            room.pop(user_id, None)
            # Deletes room when no users remain.
            if not room:
                self._rooms.pop(classroom_id, None)
            return True

    # Refreshes liveness timestamp for a user heartbeat.
    async def heartbeat(self, classroom_id: int, user_id: int) -> None:
        async with self._lock:
            # Reads room state for this heartbeat.
            room = self._rooms.get(classroom_id)
            if not room:
                return
            # Reads user state for this heartbeat.
            user_presence = room.get(user_id)
            if not user_presence:
                return
            # Updates liveness timestamp to keep user online.
            user_presence.last_seen_ts = time.time()

    # Returns the current online users snapshot for a classroom.
    async def get_users(self, classroom_id: int) -> list[dict[str, Any]]:
        async with self._lock:
            # Reads room state and defaults to empty snapshot.
            room = self._rooms.get(classroom_id, {})
            # Builds a deterministic list sorted by user id for frontend stability.
            users_snapshot = [
                {
                    "user_id": user_presence.user_id,
                    "user_name": user_presence.user_name,
                    "avatar_url": user_presence.avatar_url,
                }
                for user_presence in sorted(room.values(), key=lambda item: item.user_id)
            ]
            return users_snapshot

    # Sends a JSON payload only to teacher sockets in a classroom.
    async def broadcast_to_teachers(self, classroom_id: int, payload: dict[str, Any]) -> None:
        # Serializes once for all recipients to reduce repeated work.
        serialized_payload = json.dumps(payload)

        async with self._lock:
            # Copies teacher sockets while locked, then sends outside lock.
            room = self._rooms.get(classroom_id, {})
            # Collects unique teacher sockets across all teacher users.
            teacher_sockets = {
                socket
                for user_presence in room.values()
                if user_presence.is_teacher
                for socket in user_presence.sockets
            }

        # Sends payload to each teacher socket.
        for teacher_socket in teacher_sockets:
            try:
                await teacher_socket.send_text(serialized_payload)
            except Exception:
                # Ignore transient socket failures; leave/eviction cleanup handles state.
                continue

    # Removes stale connections that stopped heartbeating and returns removed-user count.
    async def evict_stale(self, max_age_seconds: int = 90) -> int:
        # Stores current timestamp used for age checks.
        now_ts = time.time()
        # Counts users removed during this eviction pass.
        evicted_users = 0

        async with self._lock:
            # Tracks empty rooms to delete after iterating.
            empty_room_ids: list[int] = []

            for classroom_id, room in self._rooms.items():
                # Tracks users to remove from this room.
                stale_user_ids: list[int] = []

                for user_id, user_presence in room.items():
                    # Computes seconds since this user was last seen.
                    user_age_seconds = now_ts - user_presence.last_seen_ts
                    if user_age_seconds > max_age_seconds:
                        stale_user_ids.append(user_id)

                # Removes stale users after iteration to avoid mutation during loop.
                for stale_user_id in stale_user_ids:
                    room.pop(stale_user_id, None)
                    evicted_users += 1

                # Queues empty rooms for cleanup.
                if not room:
                    empty_room_ids.append(classroom_id)

            # Removes empty rooms from global map.
            for empty_room_id in empty_room_ids:
                self._rooms.pop(empty_room_id, None)

        return evicted_users


# Exposes a singleton shared across presence endpoint modules.
presence_manager = PresenceManager()