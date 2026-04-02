import { z } from 'zod'

// Zod v4 enforces RFC 4122 version/variant bits — seed UUIDs like
// 00000000-0000-0000-0003-000000000001 fail strict validation.
// This permissive schema accepts any 8-4-4-4-12 hex string.
export const uuidStr = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    'Invalid UUID',
  )
