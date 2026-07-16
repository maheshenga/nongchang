-- One-time cutover: invalidate tokens issued before sessionKind separated Web and generic sessions.
UPDATE "users" SET "session_version" = "session_version" + 1;
