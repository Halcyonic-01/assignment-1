import { verifyEmail } from '../src/verifier.js';

async function runTests() {
  console.log('====================================================');
  console.log('   Running InboxValid Email Verification Engine Tests');
  console.log('====================================================\n');

  const testCases = [
    {
      name: 'Valid corporate email (Google)',
      email: 'alex@google.com',
      expectedStatus: 'valid'
    },
    {
      name: 'Valid free email provider (Gmail)',
      email: 'user@gmail.com',
      expectedStatus: 'valid'
    },
    {
      name: 'Disposable email provider (Mailinator)',
      email: 'test@mailinator.com',
      expectedStatus: 'risky'
    },
    {
      name: 'Role account email (admin@google.com)',
      email: 'admin@google.com',
      expectedStatus: 'risky'
    },
    {
      name: 'Invalid syntax - missing domain',
      email: 'user@',
      expectedStatus: 'invalid'
    },
    {
      name: 'Invalid syntax - no @ symbol',
      email: 'notanemail',
      expectedStatus: 'invalid'
    },
    {
      name: 'Non-existent domain (no MX records)',
      email: 'test@nonexistentdomainxyz123456.com',
      expectedStatus: 'invalid'
    },
    {
      name: 'Empty string',
      email: '',
      expectedStatus: 'invalid'
    },
    {
      name: 'Null input',
      email: null,
      expectedStatus: 'invalid'
    },
    {
      name: 'Unicode / IDN email (not supported)',
      email: '用户@例子.广告',
      expectedStatus: 'invalid'
    },
    {
      name: 'Email exceeding 254 character RFC limit',
      email: 'a'.repeat(65) + '@' + 'b'.repeat(185) + '.com',
      expectedStatus: 'invalid'
    },
    {
      name: 'Local part exceeding 64 character RFC limit',
      email: 'a'.repeat(65) + '@example.com',
      expectedStatus: 'invalid'
    },
    {
      name: 'Unbracketed IP address as domain (user@192.168.1.1)',
      email: 'user@192.168.1.1',
      expectedStatus: 'invalid'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    console.log(`[TEST] ${tc.name}`);
    console.log(`       Input: "${tc.email}"`);

    try {
      const res = await verifyEmail(tc.email);
      const isPass = res.status === tc.expectedStatus;

      if (isPass) {
        console.log(`       Result: PASS (status=${res.status}, score=${res.score}, reason="${res.reason}")`);
        passed++;
      } else {
        console.error(`       Result: FAIL! Expected "${tc.expectedStatus}" but got "${res.status}".`);
        console.error(`       Full output:`, res);
        failed++;
      }
    } catch (err) {
      console.error(`       Result: ERROR! Threw unexpected exception:`, err);
      failed++;
    }
    console.log('----------------------------------------------------');
  }

  console.log(`\nTest Summary: ${passed}/${testCases.length} Passed, ${failed} Failed.`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
