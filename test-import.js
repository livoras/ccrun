// Test importing from dist
import ccrunDefault from './dist/index.js';
import { ccrun as ccrunNamed } from './dist/index.js';

console.log('Default import:', typeof ccrunDefault);
console.log('Named import:', typeof ccrunNamed);

// Test if they're callable
try {
  if (typeof ccrunDefault === 'function') {
    const instance1 = ccrunDefault();
    console.log('ccrunDefault() works:', !!instance1);
  }
} catch (e) {
  console.error('Error with default:', e.message);
}

try {
  if (typeof ccrunNamed === 'function') {
    const instance2 = ccrunNamed();
    console.log('ccrunNamed() works:', !!instance2);
  }
} catch (e) {
  console.error('Error with named:', e.message);
}