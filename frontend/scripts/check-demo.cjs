// Compatibility entry point for the original README command.
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', 'tests/assistant.test.mjs', 'tests/render.test.cjs', 'tests/server.test.mjs', 'tests/reviews.test.mjs', 'tests/review-repairs.test.mjs'], { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' })
process.exitCode = result.status ?? 1
