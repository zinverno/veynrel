// Reuse the isolated host and synthetic fixture; select only this pass's journey.
process.argv[5] = 'followup';
await import('./visual.mjs');
