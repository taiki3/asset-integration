/**
 * Vitest global setup
 */

// Mock environment variables
process.env.GOOGLE_GENAI_API_KEY = 'test-api-key';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// Disable console.log in tests (optional, can be removed if debug output needed)
// vi.spyOn(console, 'log').mockImplementation(() => {});
