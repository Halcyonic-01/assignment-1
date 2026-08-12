import dns from 'dns';
import { DISPOSABLE_DOMAINS, ROLE_ACCOUNT_PREFIXES, FREE_EMAIL_PROVIDERS } from './data/disposable.js';
import { withExponentialBackoff } from './utils/retry.js';
import { ErrorCodes, VerificationError } from './utils/errors.js';

// Standard RFC 5322 compliant regex for email syntax validation
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Validates a single email address using a high-throughput 5-layer pipeline.
 *
 * Layer 1: Input & Syntax check (RFC 5321 length limits + RFC 5322 regex)
 * Layer 2: Disposable Domain check (Fast O(1) Set lookup)
 * Layer 3: Role Account detection (admin@, support@, info@, etc.)
 * Layer 4: Free Email Provider classification (Gmail, Yahoo, Outlook, etc.)
 * Layer 5: MX Record Lookup (via Node.js built-in DNS with exponential backoff)
 *
 * @param {string} email - The email address to validate
 * @returns {Promise<Object>} Verification result with status, score, reason, and details
 */
export async function verifyEmail(email) {
  // Layer 1: Input Sanitization & Basic Type Guard
  if (typeof email !== 'string') {
    return createResult('invalid', 0.0, 'Invalid input type: Email must be a string.', {
      syntax_valid: false,
      disposable: false,
      role_account: false,
      free_provider: false,
      mx_found: false,
      mx_records: []
    });
  }

  const trimmedEmail = email.trim();

  if (!trimmedEmail) {
    return createResult('invalid', 0.0, 'Email address cannot be empty.', {
      syntax_valid: false,
      disposable: false,
      role_account: false,
      free_provider: false,
      mx_found: false,
      mx_records: []
    });
  }

  // Length checks according to RFC 5321
  if (trimmedEmail.length > 254) {
    return createResult('invalid', 0.0, 'Email address exceeds maximum RFC length limit (254 characters).', {
      syntax_valid: false,
      disposable: false,
      role_account: false,
      free_provider: false,
      mx_found: false,
      mx_records: []
    });
  }

  const parts = trimmedEmail.split('@');
  if (parts.length !== 2) {
    return createResult('invalid', 0.0, 'Malformed email format: Must contain exactly one "@" symbol.', {
      syntax_valid: false,
      disposable: false,
      role_account: false,
      free_provider: false,
      mx_found: false,
      mx_records: []
    });
  }

  const [localPart, domainPart] = parts;

  if (localPart.length > 64) {
    return createResult('invalid', 0.0, 'Local part of email exceeds RFC limit (64 characters).', {
      syntax_valid: false,
      disposable: false,
      role_account: false,
      free_provider: false,
      mx_found: false,
      mx_records: []
    });
  }

  if (!EMAIL_REGEX.test(trimmedEmail)) {
    return createResult('invalid', 0.0, 'Syntax validation failed: Invalid email structure.', {
      syntax_valid: false,
      disposable: false,
      role_account: false,
      free_provider: false,
      mx_found: false,
      mx_records: []
    });
  }

  // TLD Check: Domain TLD (after last dot) cannot be purely numeric unless enclosed in brackets [IP]
  const domainParts = domainPart.split('.');
  const tld = domainParts[domainParts.length - 1];
  if (/^\d+$/.test(tld)) {
    return createResult('invalid', 0.0, 'Syntax validation failed: Domain TLD cannot be purely numeric. IP addresses must be enclosed in brackets like user@[192.168.1.1].', {
      syntax_valid: false,
      disposable: false,
      role_account: false,
      free_provider: false,
      mx_found: false,
      mx_records: []
    });
  }

  const domainLower = domainPart.toLowerCase();
  const localLower = localPart.toLowerCase();

  // Layer 2: Disposable Domain Check
  const isDisposable = DISPOSABLE_DOMAINS.has(domainLower);
  if (isDisposable) {
    return createResult('risky', 0.15, 'Disposable or temporary email address detected.', {
      syntax_valid: true,
      disposable: true,
      role_account: ROLE_ACCOUNT_PREFIXES.has(localLower),
      free_provider: FREE_EMAIL_PROVIDERS.has(domainLower),
      mx_found: false,
      mx_records: []
    });
  }

  // Layer 3: Role Account Check
  const isRoleAccount = ROLE_ACCOUNT_PREFIXES.has(localLower);

  // Layer 4: Free Email Provider Classification
  const isFreeProvider = FREE_EMAIL_PROVIDERS.has(domainLower);

  // Layer 5: MX Record Lookup using Node.js built-in DNS with exponential backoff
  let mxRecords = [];
  let mxFound = false;
  let dnsError = null;

  try {
    const records = await withExponentialBackoff(
      () => dns.promises.resolveMx(domainLower),
      { maxRetries: 3, initialDelayMs: 250 }
    );

    if (records && records.length > 0) {
      mxFound = true;
      // Sort records by priority (lowest number = highest priority)
      records.sort((a, b) => a.priority - b.priority);
      mxRecords = records.map((r) => r.exchange);
    }
  } catch (err) {
    // Wrap raw DNS errors in a structured VerificationError for consistent error handling
    dnsError = err instanceof VerificationError
      ? err
      : new VerificationError(ErrorCodes.DNS_TIMEOUT, err.message, { originalCode: err.code });
  }

  // Evaluate MX results and assign score/status
  if (!mxFound) {
    // Resolve the underlying DNS error code (may be wrapped in VerificationError)
    const dnsCode = dnsError?.details?.originalCode ?? dnsError?.code;

    // Distinguish between no MX records (definitive invalid domain) vs transient DNS failure (risky)
    if (dnsError && (dnsCode === 'ENOTFOUND' || dnsCode === 'ENODATA' || dnsCode === 'ESERVFAIL')) {
      return createResult('invalid', 0.0, `Domain "${domainLower}" has no valid Mail Exchange (MX) records.`, {
        syntax_valid: true,
        disposable: false,
        role_account: isRoleAccount,
        free_provider: isFreeProvider,
        mx_found: false,
        mx_records: []
      });
    }

    // DNS lookup failure or timeout - fail open gracefully as 'risky'
    return createResult('risky', 0.40, `Could not verify domain MX records due to DNS lookup issue: ${dnsError ? dnsError.message : 'Unknown DNS error'}`, {
      syntax_valid: true,
      disposable: false,
      role_account: isRoleAccount,
      free_provider: isFreeProvider,
      mx_found: false,
      mx_records: []
    });
  }

  // Calculate dynamic confidence score
  let score = 0.95;
  let reason = 'Email passes all syntax, domain, and MX deliverability checks.';

  if (isRoleAccount) {
    score = 0.70;
    reason = 'Valid email address, but associated with a generic role account (e.g. admin/support).';
  } else if (isFreeProvider) {
    score = 0.90;
    reason = 'Valid email address hosted on a public free email provider.';
  }

  return createResult(isRoleAccount ? 'risky' : 'valid', score, reason, {
    syntax_valid: true,
    disposable: false,
    role_account: isRoleAccount,
    free_provider: isFreeProvider,
    mx_found: true,
    mx_records: mxRecords
  });
}

/**
 * Helper to construct a standardized validation response object
 */
function createResult(status, score, reason, details) {
  return {
    status,
    score,
    reason,
    details,
    timestamp: new Date().toISOString()
  };
}
