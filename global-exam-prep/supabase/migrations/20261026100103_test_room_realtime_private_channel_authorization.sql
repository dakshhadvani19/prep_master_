-- Test Rooms use authenticated private Realtime channels. This policy permits
-- Broadcast and Presence only on high-entropy, 10-character Test Room topics.
-- It intentionally does not open the Realtime schema to anon/public clients.
CREATE POLICY "test_room_authenticated_read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
    (SELECT realtime.topic()) ~ '^test-room:[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$'
    AND extension IN ('broadcast', 'presence')
);

CREATE POLICY "test_room_authenticated_send"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
    (SELECT realtime.topic()) ~ '^test-room:[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$'
    AND extension IN ('broadcast', 'presence')
);
