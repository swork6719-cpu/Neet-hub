# NEET MCQ Generator Security Specification

## Data Invariants
1. A user can only access their own profile.
2. An MCQ set must belong to a valid user.
3. Only the owner of an MCQ set can read or download it.
4. MCQ sets are immutable once created (except for internal metadata if needed, though currently not implemented).

## The Dirty Dozen Payloads (Rejection Tests)
1. **Identity Theft**: Creating an MCQSet where `userId` does not match the authenticated user.
2. **Shadow Field Injection**: Adding an `isAdmin: true` field to an MCQSet.
3. **Privilege Escalation**: Attempting to read another user's MCQ set by ID.
4. **Data Poisoning**: Injecting 1MB of junk text into the `topic` field.
5. **Timestamp Spoofing**: Sending a manual `createdAt` string instead of `serverTimestamp()`.
6. **Relational Ghost**: Creating an MCQSet with a non-existent `userId` (schema validation).
7. **Size Attack**: Sending an array of 500 MCQs instead of the allowed 50-60 range.
8. **Malformed Options**: Sending an MCQ with only 2 options.
9. **Cross-Tenant List**: Querying for ALL MCQ sets without a UID filter.
10. **ID Poisoning**: Using a 1KB string as the document ID for an MCQ set.
11. **Type Confusion**: Sending `questions` as a string instead of an array.
12. **Status Shortcutting**: (Not applicable yet, but ready for future features).

## Test Runner (Security Rules Enforcement)
The `firestore.rules` will explicitly block these vectors using the Master Gate and Validation Blueprint patterns.
