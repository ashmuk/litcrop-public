import type { ErrorCode } from '@litcrop/shared';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    statusCode: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: Record<string, unknown>) {
    super('NOT_FOUND', 404, message, details);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', 400, message, details);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: Record<string, unknown>) {
    super('CONFLICT', 409, message, details);
    this.name = 'ConflictError';
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal server error', details?: Record<string, unknown>) {
    super('INTERNAL_ERROR', 500, message, details);
    this.name = 'InternalError';
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Payload too large', details?: Record<string, unknown>) {
    super('PAYLOAD_TOO_LARGE', 413, message, details);
    this.name = 'PayloadTooLargeError';
  }
}

export class UpstreamError extends AppError {
  constructor(message = 'Upstream service error', details?: Record<string, unknown>) {
    super('UPSTREAM_ERROR', 502, message, details);
    this.name = 'UpstreamError';
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable', details?: Record<string, unknown>) {
    super('SERVICE_UNAVAILABLE', 503, message, details);
    this.name = 'ServiceUnavailableError';
  }
}

export class BadCursorError extends AppError {
  constructor(message = 'Invalid pagination cursor', details?: Record<string, unknown>) {
    super('BAD_CURSOR', 400, message, details);
    this.name = 'BadCursorError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', details?: Record<string, unknown>) {
    super('RATE_LIMITED', 429, message, details);
    this.name = 'RateLimitError';
  }
}

export class BudgetExceededError extends AppError {
  constructor(
    message: string,
    details: {
      scope: 'user' | 'global';
      reset_at: string;
      input_tokens_used: number;
      output_tokens_used: number;
      input_tokens_limit: number;
      output_tokens_limit: number;
    },
  ) {
    super('BUDGET_EXCEEDED', 429, message, details);
    this.name = 'BudgetExceededError';
  }
}
