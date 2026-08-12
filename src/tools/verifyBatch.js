import { verifyEmail } from '../verifier.js';

export const VERIFY_BATCH_TOOL = {
  name: 'verify_email_batch',
  description: 'Validates a list of email addresses concurrently with structured aggregate metrics and per-address breakdown.',
  inputSchema: {
    type: 'object',
    properties: {
      addresses: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'Array of email addresses to validate (e.g. ["a@test.com", "b@test.com"]). Maximum 100 addresses per call.'
      }
    },
    required: ['addresses']
  }
};

export async function handleVerifyBatch(args) {
  const { addresses } = args || {};

  if (!Array.isArray(addresses) || addresses.length === 0) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'invalid',
            reason: 'Missing or empty "addresses" array.'
          }, null, 2)
        }
      ]
    };
  }

  if (addresses.length > 100) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'invalid',
            reason: 'Batch size exceeds maximum limit of 100 email addresses per batch call.'
          }, null, 2)
        }
      ]
    };
  }

  // Execute verification concurrently across all addresses
  const results = await Promise.all(
    addresses.map(async (address) => {
      const res = await verifyEmail(address);
      return {
        email: address,
        ...res
      };
    })
  );

  // Compute aggregate statistics
  const summary = {
    total: results.length,
    valid: results.filter((r) => r.status === 'valid').length,
    invalid: results.filter((r) => r.status === 'invalid').length,
    risky: results.filter((r) => r.status === 'risky').length
  };

  const batchResult = {
    summary,
    results,
    timestamp: new Date().toISOString()
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(batchResult, null, 2)
      }
    ]
  };
}
