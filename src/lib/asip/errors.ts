/**
 * ASIP Pipeline Error Classes
 *
 * Custom error classes for better error handling and categorization
 */

/**
 * Base error class for ASIP pipeline errors
 */
export class ASIPError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ASIPError';
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * Error thrown when a run is not found
 */
export class RunNotFoundError extends ASIPError {
  constructor(runId: number) {
    super(`Run ${runId} not found`, 'RUN_NOT_FOUND', { runId });
    this.name = 'RunNotFoundError';
  }
}

/**
 * Error thrown when required resources are missing
 */
export class MissingResourceError extends ASIPError {
  constructor(resourceType: 'target_spec' | 'technical_assets' | 'both') {
    const message = resourceType === 'both'
      ? 'ターゲット仕様と技術資産の両方が見つかりません'
      : resourceType === 'target_spec'
        ? 'ターゲット仕様が見つかりません'
        : '技術資産が見つかりません';
    super(message, 'MISSING_RESOURCE', { resourceType });
    this.name = 'MissingResourceError';
  }
}

/**
 * Error thrown when a hypothesis is not found
 */
export class HypothesisNotFoundError extends ASIPError {
  constructor(uuid: string) {
    super(`Hypothesis ${uuid} not found`, 'HYPOTHESIS_NOT_FOUND', { uuid });
    this.name = 'HypothesisNotFoundError';
  }
}

/**
 * Error thrown when Deep Research fails
 */
export class DeepResearchError extends ASIPError {
  constructor(message: string, step: string, cause?: Error) {
    super(
      `Deep Research 失敗 (${step}): ${message}`,
      'DEEP_RESEARCH_ERROR',
      { step, cause: cause?.message }
    );
    this.name = 'DeepResearchError';
  }
}

/**
 * Error thrown when AI content generation fails
 */
export class ContentGenerationError extends ASIPError {
  constructor(message: string, step: string, cause?: Error) {
    super(
      `コンテンツ生成失敗 (${step}): ${message}`,
      'CONTENT_GENERATION_ERROR',
      { step, cause: cause?.message }
    );
    this.name = 'ContentGenerationError';
  }
}

/**
 * Error thrown when hypothesis parsing fails
 */
export class HypothesisParsingError extends ASIPError {
  constructor(message: string) {
    super(`仮説パース失敗: ${message}`, 'HYPOTHESIS_PARSING_ERROR');
    this.name = 'HypothesisParsingError';
  }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class RateLimitError extends ASIPError {
  constructor(retryAfterSeconds?: number) {
    super(
      `レート制限に達しました${retryAfterSeconds ? `。${retryAfterSeconds}秒後に再試行してください` : ''}`,
      'RATE_LIMIT_ERROR',
      { retryAfterSeconds }
    );
    this.name = 'RateLimitError';
  }
}

/**
 * Error thrown when operation times out
 */
export class TimeoutError extends ASIPError {
  constructor(operation: string, timeoutMs: number) {
    super(
      `操作がタイムアウトしました: ${operation} (${timeoutMs}ms)`,
      'TIMEOUT_ERROR',
      { operation, timeoutMs }
    );
    this.name = 'TimeoutError';
  }
}

/**
 * Check if an error is a specific ASIP error type
 */
export function isASIPError(error: unknown): error is ASIPError {
  return error instanceof ASIPError;
}

/**
 * Get a user-friendly error message from any error
 */
export function getErrorMessage(error: unknown): string {
  if (isASIPError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

/**
 * Create an appropriate ASIP error from an unknown error
 */
export function wrapError(error: unknown, context: string): ASIPError {
  if (isASIPError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  return new ASIPError(
    `${context}: ${message}`,
    'UNKNOWN_ERROR',
    { originalError: message }
  );
}
