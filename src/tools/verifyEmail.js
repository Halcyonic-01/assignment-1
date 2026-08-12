import { verifyEmail } from '../verifier.js';

export const VERIFY_EMAIL_TOOL = {
  name: 'verify_email',
  description: 'Validates a single email address for deliverability, syntax, disposable domain detection, role account identification, and domain MX records.',
  inputSchema: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'The email address to validate (e.g. "user@example.com").'
      }
    },
    required: ['address']
  }
};

export async function handleVerifyEmail(args) {
  const { address } = args || {};

  if (!address) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'invalid',
            score: 0.0,
            reason: 'Missing required argument: "address".'
          }, null, 2)
        }
      ]
    };
  }

  const result = await verifyEmail(address);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}
