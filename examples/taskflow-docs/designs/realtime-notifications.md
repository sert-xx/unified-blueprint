---
title: Real-time Notification System
doc_type: design
---

# Real-time Notification System

## Overview

The TaskFlow real-time notification system delivers instant updates to connected clients using WebSocket connections managed by Socket.IO. The system enables collaborative features such as live task status changes, new comment alerts, and project activity feeds without requiring clients to poll the API.

The notification system is built on an **event bus architecture** that decouples event producers (services) from event consumers (connected clients). This separation allows the system to evolve delivery mechanisms without modifying business logic.

Related documents:

- [[designs/architecture|references]]
- [[api/websocket-events|implements]]

## Connection Management

### Connection Lifecycle

Each WebSocket connection goes through the following states:

```
  ┌────────────┐    auth success    ┌──────────────┐
  │ Connecting │───────────────────►│ Authenticated │
  └─────┬──────┘                    └──────┬───────┘
        │                                  │
   auth failure                     join project rooms
        │                                  │
        ▼                                  ▼
  ┌────────────┐                    ┌──────────────┐
  │ Rejected   │                    │   Active     │◄──── heartbeat
  └────────────┘                    └──────┬───────┘
                                           │
                                    disconnect / timeout
                                           │
                                           ▼
                                    ┌──────────────┐
                                    │ Disconnected │
                                    └──────────────┘
```

### Authentication

WebSocket connections authenticate using the same JWT access tokens as the REST API. The token is sent as a query parameter during the initial handshake:

```typescript
const socket = io('wss://api.taskflow.example', {
  auth: {
    token: accessToken,
  },
});
```

The server validates the token in the `connection` middleware before allowing the socket to proceed. If the token is expired or invalid, the connection is rejected with an `auth_error` event.

### Room Management

After authentication, clients are automatically subscribed to rooms based on their project memberships:

| Room Pattern              | Members                        | Events Received                    |
|---------------------------|--------------------------------|------------------------------------|
| `user:{userId}`           | Single user (all their sockets)| Personal notifications, mentions   |
| `project:{projectId}`     | All members of the project     | Task changes, new comments         |
| `project:{projectId}:task:{taskId}` | Users viewing the task | Real-time edits, typing indicators |

When a user's project membership changes, room subscriptions are updated in real time. Adding a member to a project immediately subscribes all their active sockets to the project room.

### Heartbeat and Presence

The server sends a `ping` frame every 25 seconds. If no `pong` is received within 10 seconds, the connection is considered dead and is cleaned up. This allows the system to detect stale connections caused by network changes or client crashes.

Client presence is tracked per-room. The system broadcasts `user_joined` and `user_left` events to project rooms, enabling features like "who's online" indicators.

## Event Bus Architecture

The event bus is the central routing mechanism between services that produce events and WebSocket connections that consume them.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ TaskService  │     │ CommentSvc   │     │ ProjectSvc   │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │  emit(event)       │  emit(event)       │  emit(event)
       │                    │                    │
       ▼                    ▼                    ▼
┌──────────────────────────────────────────────────────────┐
│                       Event Bus                          │
│                                                          │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────────┐  │
│  │  In-Memory │  │ Redis Pub/  │  │  Persistence     │  │
│  │  Dispatch  │  │ Sub Bridge  │  │  (write-behind)  │  │
│  └─────┬──────┘  └──────┬──────┘  └────────┬─────────┘  │
│        │                │                   │            │
└────────┼────────────────┼───────────────────┼────────────┘
         │                │                   │
         ▼                ▼                   ▼
   ┌───────────┐   ┌───────────┐      ┌────────────┐
   │ Local     │   │ Remote    │      │ PostgreSQL │
   │ Sockets   │   │ Instances │      │ (history)  │
   └───────────┘   └───────────┘      └────────────┘
```

### Single-Instance Path

When a single server instance is running, events are dispatched directly from the in-memory event bus to connected sockets. No external infrastructure is required.

### Multi-Instance Path

In a horizontally scaled deployment, events must reach clients connected to different server instances. The event bus publishes each event to a Redis Pub/Sub channel. All instances subscribe to these channels and forward matching events to their local sockets.

The Redis channel naming convention follows the room pattern:

```
taskflow:events:project:{projectId}
taskflow:events:user:{userId}
```

### Persistence Path

All notification events are written to a `notifications` table in PostgreSQL using a write-behind strategy. Events are batched in memory and flushed every 2 seconds or when the batch reaches 100 events, whichever comes first. This provides a persistent notification history for clients that were offline when events occurred.

## Event Types

The following events are emitted by the system:

| Event Name              | Room Target                | Payload Summary                              | Trigger                         |
|-------------------------|----------------------------|----------------------------------------------|---------------------------------|
| `task.created`          | `project:{projectId}`      | `{ task, createdBy }`                        | New task created                |
| `task.updated`          | `project:{projectId}`      | `{ taskId, changes, updatedBy }`             | Task fields modified            |
| `task.status_changed`   | `project:{projectId}`      | `{ taskId, oldStatus, newStatus, changedBy }`| Status transition               |
| `task.assigned`         | `project:{projectId}`, `user:{assigneeId}` | `{ taskId, assigneeId, assignedBy }` | Task assigned to user     |
| `task.deleted`          | `project:{projectId}`      | `{ taskId, deletedBy }`                      | Task permanently removed        |
| `comment.created`       | `project:{projectId}:task:{taskId}` | `{ comment, author }`              | New comment posted              |
| `comment.updated`       | `project:{projectId}:task:{taskId}` | `{ commentId, newBody, updatedBy }` | Comment edited                  |
| `comment.deleted`       | `project:{projectId}:task:{taskId}` | `{ commentId, deletedBy }`         | Comment removed                 |
| `member.added`          | `project:{projectId}`      | `{ userId, role, addedBy }`                  | New member joined project       |
| `member.removed`        | `project:{projectId}`      | `{ userId, removedBy }`                      | Member removed from project     |
| `user.mentioned`        | `user:{mentionedUserId}`   | `{ taskId, commentId, mentionedBy }`         | @mention in comment             |
| `project.archived`      | `project:{projectId}`      | `{ projectId, archivedBy }`                  | Project archived                |

### Event Envelope

All events share a common envelope structure:

```typescript
interface EventEnvelope<T> {
  id: string;           // Unique event ID (UUID)
  type: string;         // Event name (e.g., "task.created")
  timestamp: string;    // ISO 8601 timestamp
  roomTarget: string;   // Target room for delivery
  payload: T;           // Event-specific data
  meta: {
    actorId: string;    // User who triggered the event
    projectId: string;  // Associated project
    requestId: string;  // Correlates with the originating API request
  };
}
```

## Delivery Guarantees

The notification system provides **at-least-once delivery** for connected clients and **best-effort delivery** for the real-time path, complemented by a persistent catch-up mechanism.

### Connected Clients

Events are delivered to all sockets in the target room. Socket.IO handles the per-connection buffering and serialization. If a socket's buffer exceeds 1 MB, the connection is forcefully closed to prevent memory exhaustion on the server.

### Offline Clients

When a client reconnects, it can request missed events by providing the ID of the last event it received:

```
Client                          Server
  │                                │
  │  connect({ lastEventId })      │
  │───────────────────────────────►│
  │                                │  Query notifications table
  │                                │  WHERE id > lastEventId
  │  missed_events [event1, ...]   │  AND room IN user's rooms
  │◄───────────────────────────────│
  │                                │
  │  (resume real-time stream)     │
```

Missed events are retrieved from the PostgreSQL `notifications` table. Events older than 30 days are purged by a scheduled cleanup job.

### Ordering

Events within a single room are delivered in the order they were emitted. Cross-room ordering is not guaranteed. Each event includes a monotonically increasing sequence number scoped to its room, allowing clients to detect and handle out-of-order delivery.

## Reconnection Strategy

Clients use an **exponential backoff with jitter** algorithm to reconnect after a disconnection. This prevents thundering herd scenarios when the server restarts or a network partition resolves.

### Backoff Algorithm

```
delay = min(BASE_DELAY * 2^attempt + random(0, JITTER), MAX_DELAY)
```

| Parameter     | Value     |
|---------------|-----------|
| `BASE_DELAY`  | 1,000 ms  |
| `JITTER`      | 1,000 ms  |
| `MAX_DELAY`   | 30,000 ms |
| Max attempts  | Unlimited |

### Reconnection Sequence

```
Attempt  Delay Range (ms)      Action
──────── ───────────────────── ───────────────────────
   1     1,000  - 2,000        Reconnect
   2     2,000  - 3,000        Reconnect
   3     4,000  - 5,000        Reconnect
   4     8,000  - 9,000        Reconnect
   5     16,000 - 17,000       Reconnect
   6+    30,000 (capped)       Reconnect + show UI warning
```

After 6 consecutive failures, the client displays a connectivity warning to the user while continuing reconnection attempts in the background. On successful reconnection, the client performs the catch-up flow described in the Delivery Guarantees section and removes the warning.

### Server-Initiated Disconnection

When the server needs to shut down gracefully (e.g., during deployment), it sends a `server_shutdown` event with a `retryAfter` timestamp. Clients wait until the specified time before attempting reconnection, avoiding unnecessary failed connection attempts during the deployment window.

```typescript
// Server-side graceful shutdown
io.emit('server_shutdown', {
  retryAfter: new Date(Date.now() + 15_000).toISOString(),
  reason: 'scheduled_deployment',
});
setTimeout(() => server.close(), 5_000);
```

## Rate Limiting

To prevent abuse and protect server resources, the notification system enforces rate limits on both inbound and outbound event flows.

### Inbound Rate Limits

Clients can emit events to the server (e.g., typing indicators, presence updates). These are rate-limited per socket:

| Event Category        | Limit                | Window  | Action on Exceed           |
|-----------------------|----------------------|---------|----------------------------|
| Typing indicators     | 5 per second         | Rolling | Silently drop              |
| Presence updates      | 1 per 10 seconds     | Rolling | Silently drop              |
| Custom events         | 20 per minute        | Rolling | Warning, then disconnect   |

### Outbound Rate Limits

The server limits the rate of events delivered to any single socket to prevent a hyperactive project from overwhelming a client:

| Limit Type             | Threshold            | Action                             |
|------------------------|----------------------|------------------------------------|
| Events per second      | 50                   | Buffer and batch remaining events  |
| Events per minute      | 500                  | Summarize (e.g., "15 tasks updated") |
| Payload size per event | 64 KB                | Truncate payload, include fetch URL |

### Batch Delivery

When the outbound rate limit is reached, events are buffered and delivered as a batch on the next tick. The client receives a `batch` event containing an array of individual events. This reduces the number of frames sent over the WebSocket connection while preserving all event data.

```typescript
// Batch event structure
interface BatchEvent {
  type: 'batch';
  events: EventEnvelope<unknown>[];
  reason: 'rate_limit' | 'optimization';
}
```

### Connection Limits

| Resource                     | Limit           | Scope          |
|------------------------------|-----------------|----------------|
| Concurrent sockets per user  | 10              | Per user       |
| Total concurrent connections | 10,000          | Per instance   |
| Rooms per socket             | 50              | Per socket     |
| Message size                 | 256 KB          | Per frame      |

When a user exceeds the concurrent socket limit, the oldest idle connection is gracefully closed with a `max_connections` error code. The client can then decide whether to reconnect or defer to the existing sessions.
