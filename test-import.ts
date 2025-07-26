// Test importing from src
import ccrunDefault from './src/index';
import { ccrun as ccrunNamed } from './src/index';

console.log('Default import:', typeof ccrunDefault);
console.log('Named import:', typeof ccrunNamed);

// Test if they're callable
try {
  if (typeof ccrunDefault === 'function') {
    const instance1 = ccrunDefault();
    console.log('ccrunDefault() returns:', instance1);
    console.log('Has watch:', !!instance1.watch);
    console.log('Has then:', !!instance1.then);
  }
} catch (e) {
  console.error('Error with default:', e.message);
}

try {
  if (typeof ccrunNamed === 'function') {
    const instance2 = ccrunNamed();
    console.log('ccrunNamed() returns:', instance2);
    console.log('Has watch:', !!instance2.watch);
    console.log('Has then:', !!instance2.then);
  }
} catch (e) {
  console.error('Error with named:', e.message);
}