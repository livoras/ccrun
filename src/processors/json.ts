import { ProcessorContext } from '../types';

/**
 * JSON processor - extracts and parses JSON from text
 * 
 * Handles two cases:
 * 1. If input is an object with 'output' field, parse JSON from output string
 * 2. If input is a string, parse JSON from the string
 * 
 * Looks for ```json ... ``` code blocks and extracts the JSON content
 */
export default function(data: any, next: (data: any) => void, _context: ProcessorContext) {
  try {
    let textToParse: string;
    
    // Determine what text to parse
    if (typeof data === 'object' && data !== null && 'output' in data) {
      // Case 1: Object with output field
      textToParse = String(data.output);
      console.log('[JSON] Parsing from output field');
    } else if (typeof data === 'string') {
      // Case 2: Direct string
      textToParse = data;
      console.log('[JSON] Parsing from string');
    } else {
      // No parseable content, pass through
      console.log('[JSON] No parseable content found, passing through data');
      next(data);
      return;
    }
    
    // Extract JSON from code blocks
    // Match ```json ... ``` or ``` ... ``` blocks
    const jsonCodeBlockRegex = /```(?:json)?\s*\n([\s\S]*?)\n```/g;
    const matches = [...textToParse.matchAll(jsonCodeBlockRegex)];
    
    if (matches.length > 0) {
      // Found code blocks, try to parse each one
      for (const match of matches) {
        const jsonString = match[1].trim();
        try {
          const parsed = JSON.parse(jsonString);
          console.log('[JSON] Successfully parsed JSON from code block');
          next(parsed);
          return;
        } catch (e) {
          // This block wasn't valid JSON, try next one
          console.log('[JSON] Failed to parse block, trying next...');
        }
      }
    }
    
    // No code blocks found or none were valid JSON
    // Try to find raw JSON in the text
    // Look for common JSON patterns: {}, [], or quoted strings
    const jsonPatterns = [
      /(\{[\s\S]*\})/,  // Object
      /(\[[\s\S]*\])/,  // Array
      /"([^"]*)"(?:\s|$)/  // Quoted string
    ];
    
    for (const pattern of jsonPatterns) {
      const match = textToParse.match(pattern);
      if (match) {
        try {
          const parsed = JSON.parse(match[1] || match[0]);
          console.log('[JSON] Successfully parsed raw JSON');
          next(parsed);
          return;
        } catch (e) {
          // Not valid JSON, continue
        }
      }
    }
    
    // Try parsing the entire text as JSON
    try {
      const parsed = JSON.parse(textToParse.trim());
      console.log('[JSON] Successfully parsed entire text as JSON');
      next(parsed);
      return;
    } catch (e) {
      // Not valid JSON
    }
    
    // No valid JSON found
    console.error('[JSON] No valid JSON found in input');
    console.log('[JSON] Input text:', textToParse.substring(0, 200) + '...');
    
    // Pass through original data
    next(data);
    
  } catch (error) {
    console.error('[JSON] Error processing:', error);
    next(data);
  }
}