# Security Specification for Cosmic Shooter Leaderboard

## 1. Data Invariants
- A score entry must have a valid playerName, a positive score, and a server-side timestamp.
- The playerName cannot exceed 50 characters and must only contain alphanumeric characters and spaces.
- Scores cannot be negative.
- Timestamps must be strictly enforced via `request.time`.
- Once a score entry is created, it cannot be modified or deleted by users.

## 2. The "Dirty Dozen" Payloads

### Identity/Integrity Violations
1. **Empty Name**: `{ "playerName": "", "score": 100, "timestamp": "2026-10-09T00:00:00Z" }` (Should fail: minLength)
2. **Excessive Name**: `{ "playerName": "A".repeat(51), "score": 100, "timestamp": "2026-10-09T00:00:00Z" }` (Should fail: maxLength)
3. **Invalid Characters**: `{ "playerName": "Player!@#", "score": 100, "timestamp": "2026-10-09T00:00:00Z" }` (Should fail: pattern)
4. **Negative Score**: `{ "playerName": "Player1", "score": -50, "timestamp": "2026-10-09T00:00:00Z" }` (Should fail: logic invariant)
5. **Missing Fields**: `{ "playerName": "Player1" }` (Should fail: missing fields)
6. **Extra Field (Ghost Field)**: `{ "playerName": "Player1", "score": 100, "timestamp": "2026-10-09T00:00:00Z", "isAdmin": true }` (Should fail: hasOnly)

### State Violations
7. **Modify Existing Score**: Attempting to update a document in `scores/{scoreId}`. (Should fail: immutable)
8. **Delete Score**: Attempting to delete a document in `scores/{scoreId}`. (Should fail: read-only)

### Timestamp Violations
9. **Client Timestamp**: `{ "playerName": "Player1", "score": 100, "timestamp": "2025-01-01T00:00:00Z" }` (Should fail: request.time)

### Query Violation
10. **Unauthenticated List**: Attempting to list all scores without being signed in. (Should fail: authentication)
11. **Query Poisoning**: Injecting 1MB junk data into a query. (Should fail: size constraints)
12. **Unauthorized Update**: Attempting to set `score` to a string instead of a number. (Should fail: type safety)
