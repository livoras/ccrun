export default function(data: any, next: any, context: any) {
  // Test case 1: Object with output containing JSON code block
  const testCase1 = {
    input: data,
    output: `Here's the user object you requested:

\`\`\`json
{
  "name": "John Doe",
  "age": 30,
  "email": "john@example.com",
  "hobbies": ["reading", "coding", "hiking"]
}
\`\`\`

This JSON represents a typical user profile.`
  };
  
  // Test case 2: Direct string with JSON
  const testCase2 = `The response is: \`\`\`json
{"status": "success", "data": {"id": 123, "values": [1, 2, 3]}}
\`\`\``;
  
  // Test case 3: Raw JSON without code block
  const testCase3 = '{"message": "Hello", "timestamp": 1234567890}';
  
  // Pass one of the test cases
  console.log('[JSON Test] Passing test case 1 (object with output)');
  next(testCase1);
}