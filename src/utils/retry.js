/**
 * Exponential backoff retry utility with jitter.
 * Handles transient network/DNS resolution failures gracefully.
 *
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry configuration options
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} options.initialDelayMs - Initial delay in milliseconds (default: 300)
 * @param {number} options.backoffFactor - Multiplier for delay (default: 2)
 * @returns {Promise<any>}
 */
export async function withExponentialBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelayMs = 300,
    backoffFactor = 2
  } = options;

  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) {
        throw error;
      }

      // Calculate exponential backoff with full jitter to avoid thundering herd
      const jitter = Math.random() * 0.3 + 0.85; // 0.85 - 1.15
      const currentDelay = Math.round(delay * jitter);

      await new Promise((resolve) => setTimeout(resolve, currentDelay));
      delay *= backoffFactor;
    }
  }
}
