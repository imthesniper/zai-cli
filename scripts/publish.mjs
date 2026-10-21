#!/usr/bin/env node
// Publishing is an explicit maintainer operation, not an installer side effect.
console.error('Source lives at https://github.com/imthesniper/zai-cli.');
console.error('Use a reviewed pull request for source updates. See docs/PUBLISHING.md.');
console.error('No repository, branch, tag, credential, or npm package was changed.');
process.exitCode = 1;
