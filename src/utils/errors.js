/**
 * Structured error codes for email verification operations.
 */
export const ErrorCodes = {
  INVALID_INPUT: 'INVALID_INPUT',
  SYNTAX_ERROR: 'SYNTAX_ERROR',
  DISPOSABLE_DOMAIN: 'DISPOSABLE_DOMAIN',
  NO_MX_RECORDS: 'NO_MX_RECORDS',
  DNS_TIMEOUT: 'DNS_TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
};

export class VerificationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'VerificationError';
    this.code = code;
    this.details = details;
  }
}
