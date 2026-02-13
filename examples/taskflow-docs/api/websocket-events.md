---
title: WebSocket Events API
doc_type: api
---

# WebSocket Events API

## Overview

The TaskFlow WebSocket API provides real-time, bidirectional communication between clients and the server. It enables instant delivery of task updates, new comments, and other workspace activity without polling.

This API implements the notification system described in [[designs/realtime-notifications|implements]] and serves as a real-time companion to the [[api/rest-endpoints|extends]]. While the REST API is used for CRUD operations, the WebSocket API pushes state changes to connected clients immediately after they occur.

All WebSocket communication uses JSON-encoded text frames. Binary frames are not supported.

## Connection Protocol

### Endpoint

```
wss://ws.taskflow.example.com/v1/stream
```

| Environment | WebSocket URL                                    |
| ----------- | ------------------------------------------------ |
| Production  | `wss://ws.taskflow.example.com/v1/stream`        |
| Staging     | `wss://staging-ws.taskflow.example.com/v1/stream`|
| Local dev   | `ws://localhost:3001/v1/stream`                   |

### Handshake

Clients initiate the connection by passing the authentication token as a query parameter or in the first message after the socket opens.

**Option A: Query parameter**

```
wss://ws.taskflow.example.com/v1/stream?token=<access_token>
```

**Option B: Auth message after connect**

```json
{
  "type": "auth",
  "token": "<access_token>"
}
```

If authentication succeeds, the server responds with a confirmation:

```json
{
  "type": "auth.success",
  "user_id": "11223344-5566-7788-99aa-bbccddeeff00",
  "session_id": "ws-sess-abc123",
  "connected_at": "2025-06-15T09:00:00Z"
}
```

If authentication fails, the server sends an error and closes the connection with WebSocket close code `4001`:

```json
{
  "type": "auth.failed",
  "error": "invalid_token",
  "message": "The provided token is expired or malformed."
}
```

### Heartbeat

The server sends a `ping` frame every 30 seconds. Clients must respond with a `pong` frame within 10 seconds, or the connection is terminated. Application-level ping messages are also supported for environments where WebSocket protocol-level ping/pong is not accessible:

```json
{
  "type": "ping",
  "timestamp": "2025-06-15T09:01:30Z"
}
```

Expected client response:

```json
{
  "type": "pong",
  "timestamp": "2025-06-15T09:01:30Z"
}
```

## Client Events

Client events are messages sent from the client to the server.

### subscribe

Subscribe to a channel to receive events for a specific resource.

```json
{
  "type": "subscribe",
  "channel": "project:f0e1d2c3-b4a5-6789-0abc-def123456789",
  "request_id": "req-001"
}
```

Server acknowledgment:

```json
{
  "type": "subscribe.ok",
  "channel": "project:f0e1d2c3-b4a5-6789-0abc-def123456789",
  "request_id": "req-001"
}
```

### unsubscribe

Stop receiving events from a channel.

```json
{
  "type": "unsubscribe",
  "channel": "project:f0e1d2c3-b4a5-6789-0abc-def123456789",
  "request_id": "req-002"
}
```

Server acknowledgment:

```json
{
  "type": "unsubscribe.ok",
  "channel": "project:f0e1d2c3-b4a5-6789-0abc-def123456789",
  "request_id": "req-002"
}
```

### ping

Application-level ping as described in the heartbeat section. Useful for clients that cannot rely on WebSocket-level ping frames.

```json
{
  "type": "ping",
  "timestamp": "2025-06-15T09:05:00Z"
}
```

## Server Events

Server events are pushed to clients who are subscribed to the relevant channel.

### task.created

Fired when a new task is created in a subscribed project.

```json
{
  "type": "task.created",
  "channel": "project:f0e1d2c3-b4a5-6789-0abc-def123456789",
  "payload": {
    "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "title": "Set up CI/CD pipeline",
    "status": "open",
    "priority": "high",
    "assignee_id": "11223344-5566-7788-99aa-bbccddeeff00",
    "created_at": "2025-06-15T09:00:00Z"
  },
  "triggered_by": "11223344-5566-7788-99aa-bbccddeeff00",
  "occurred_at": "2025-06-15T09:00:01Z"
}
```

### task.updated

Fired when any field on a task changes. The `changes` object contains only the modified fields with their previous and new values.

```json
{
  "type": "task.updated",
  "channel": "project:f0e1d2c3-b4a5-6789-0abc-def123456789",
  "payload": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "changes": {
      "status": { "from": "in_progress", "to": "done" },
      "priority": { "from": "high", "to": "medium" }
    }
  },
  "triggered_by": "11223344-5566-7788-99aa-bbccddeeff00",
  "occurred_at": "2025-06-15T09:10:00Z"
}
```

### task.deleted

Fired when a task is deleted (soft-deleted).

```json
{
  "type": "task.deleted",
  "channel": "project:f0e1d2c3-b4a5-6789-0abc-def123456789",
  "payload": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  },
  "triggered_by": "11223344-5566-7788-99aa-bbccddeeff00",
  "occurred_at": "2025-06-15T09:15:00Z"
}
```

### comment.added

Fired when a comment is added to a task in a subscribed project or on a directly subscribed task.

```json
{
  "type": "comment.added",
  "channel": "task:a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "payload": {
    "id": "c1d2e3f4-a5b6-7890-cdef-123456789012",
    "task_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "author_id": "11223344-5566-7788-99aa-bbccddeeff00",
    "body": "I've pushed the initial implementation. Ready for review.",
    "created_at": "2025-06-12T11:00:00Z"
  },
  "triggered_by": "11223344-5566-7788-99aa-bbccddeeff00",
  "occurred_at": "2025-06-12T11:00:01Z"
}
```

### label.updated

Fired when a label is renamed or its color changes. Sent on the workspace channel.

```json
{
  "type": "label.updated",
  "channel": "workspace:main",
  "payload": {
    "id": "label-001",
    "changes": {
      "color": { "from": "#e74c3c", "to": "#c0392b" }
    }
  },
  "triggered_by": "11223344-5566-7788-99aa-bbccddeeff00",
  "occurred_at": "2025-06-15T10:00:00Z"
}
```

### member.joined

Fired when a new member joins a project.

```json
{
  "type": "member.joined",
  "channel": "project:f0e1d2c3-b4a5-6789-0abc-def123456789",
  "payload": {
    "user_id": "aabbccdd-eeff-0011-2233-445566778899",
    "display_name": "Jordan Lee",
    "role": "contributor"
  },
  "triggered_by": "11223344-5566-7788-99aa-bbccddeeff00",
  "occurred_at": "2025-06-15T10:30:00Z"
}
```

## Event Payload Schema

All server-pushed events share a common envelope structure:

| Field          | Type   | Description                                        |
| -------------- | ------ | -------------------------------------------------- |
| `type`         | string | Event type identifier (e.g., `task.created`)       |
| `channel`      | string | Channel the event was delivered on                 |
| `payload`      | object | Event-specific data                                |
| `triggered_by` | uuid   | User ID of the actor who caused the event          |
| `occurred_at`  | string | ISO 8601 timestamp of when the event occurred      |

The `payload` contents vary by event type. Clients should use the `type` field to determine how to deserialize the payload.

Events are delivered at-most-once. If a client disconnects and reconnects, it will not receive events that occurred during the disconnection window. Clients that require gap-free delivery should use the REST API to reconcile state after reconnection by fetching resources updated since their last known timestamp.

## Channel Subscriptions

Channels determine which events a client receives. A client must explicitly subscribe to channels after authenticating.

### Channel Types

| Channel pattern          | Example                                              | Events received                          |
| ------------------------ | ---------------------------------------------------- | ---------------------------------------- |
| `workspace:<id>`         | `workspace:main`                                     | Label changes, workspace settings        |
| `project:<project_id>`   | `project:f0e1d2c3-b4a5-6789-0abc-def123456789`      | Task CRUD, member changes in the project |
| `task:<task_id>`         | `task:a1b2c3d4-e5f6-7890-abcd-ef1234567890`         | Comments, status changes on a single task|
| `user:<user_id>`         | `user:11223344-5566-7788-99aa-bbccddeeff00`          | Personal notifications, mentions         |

### Subscription Limits

Each connection may subscribe to a maximum of 50 channels simultaneously. Attempting to subscribe beyond this limit returns an error:

```json
{
  "type": "subscribe.error",
  "channel": "project:new-project-id",
  "error": "subscription_limit_exceeded",
  "message": "Maximum of 50 channel subscriptions per connection.",
  "request_id": "req-051"
}
```

### Listing Active Subscriptions

Clients can request a list of their active subscriptions:

```json
{
  "type": "subscriptions.list",
  "request_id": "req-010"
}
```

Server response:

```json
{
  "type": "subscriptions.list.ok",
  "channels": [
    "workspace:main",
    "project:f0e1d2c3-b4a5-6789-0abc-def123456789",
    "task:a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  ],
  "request_id": "req-010"
}
```

## Error Handling

### Error Event Format

When the server cannot process a client message, it responds with a typed error:

```json
{
  "type": "error",
  "error": "invalid_message",
  "message": "The 'type' field is required in all client messages.",
  "request_id": "req-003"
}
```

### Error Codes

| Error Code                    | Description                                        |
| ----------------------------- | -------------------------------------------------- |
| `invalid_message`             | Message could not be parsed as valid JSON           |
| `unknown_type`                | The `type` field does not match any known event     |
| `invalid_channel`             | Channel format is invalid or resource not found     |
| `permission_denied`           | User lacks access to the requested channel          |
| `subscription_limit_exceeded` | Maximum channel subscriptions reached               |
| `auth_required`               | Action attempted before successful authentication   |
| `rate_limited`                | Client is sending messages too frequently           |

### Connection Close Codes

The server uses custom WebSocket close codes to communicate the reason for disconnection:

| Close Code | Meaning                                     |
| ---------- | ------------------------------------------- |
| 4000       | Normal server-initiated shutdown             |
| 4001       | Authentication failed                        |
| 4002       | Token expired during session                 |
| 4003       | Account suspended or deactivated             |
| 4008       | Heartbeat timeout (pong not received)        |
| 4009       | Rate limited (excessive message frequency)   |
| 4010       | Server maintenance (reconnect after delay)   |

Clients receiving close codes `4002` or `4010` should attempt to reconnect with exponential backoff. For `4001` and `4003`, the client should not reconnect automatically and should prompt the user to re-authenticate or contact support.

### Reconnection Strategy

Clients should implement automatic reconnection with exponential backoff:

1. Wait 1 second after the first disconnection.
2. Double the wait time on each subsequent attempt, up to a maximum of 60 seconds.
3. Add random jitter of 0-500ms to each wait to avoid thundering herd issues.
4. After reconnecting, re-authenticate and re-subscribe to all previously active channels.
5. Use the REST API to fetch any updates missed during the disconnection.
