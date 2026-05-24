#!/usr/bin/env node

/**
 * Standards Compliance Audit Script (Template)
 *
 * Customize this script for your project's standards.
 * Run with: npm run audit:standards
 *
 * @see docs/architecture/standards.md
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, relative } from 'path';

// ============================================================================
// CONFIGURATION - Customize these for your project
// ============================================================================

const CONFIG = {
  // Source directory to audit
  srcDir: 'src',

  // Maximum lines per file (§1.3)
  maxFileLines: 500,

  // File extensions to check
  fileExtensions: ['.ts', '.tsx', '.js', '.jsx'],

  // Required files that must exist
  requiredFiles: [
    'CLAUDE.md',
    'standards.md',
    'docs/adr.md',
    'docs/prd.md',
  ],

  // Optional files (warn if missing)
  optionalFiles: [
    '.husky/pre-commit', // Pre-commit hooks
  ],

  // Patterns to forbid (with explanation)
  forbiddenPatterns: [
    {
      pattern: /:\s*any(?![a-zA-Z])/g,
      name: '`any` type',
      message: 'Use proper types or `unknown` for external data',
    },
  ],
};

// ============================================================================
// IMPLEMENTATION - Modify only if needed
// ============================================================================

const ROOT = process.cwd();
const SRC = join(ROOT, CONFIG.srcDir);

// ANSI colors
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let failures = 0;
let warnings = 0;
let passes = 0;

function pass(msg) {
  console.log(`${GREEN}✓${RESET} ${msg}`);
  passes++;
}

function fail(msg) {
  console.log(`${RED}✗${RESET} ${msg}`);
  failures++;
}

function warn(msg) {
  console.log(`${YELLOW}⚠${RESET} ${msg}`);
  warnings++;
}

function getAllFiles(dir, extensions = CONFIG.fileExtensions) {
  const files = [];

  if (!existsSync(dir)) {
    return files;
  }

  const items = readdirSync(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
      files.push(...getAllFiles(fullPath, extensions));
    } else if (extensions.some((ext) => item.endsWith(ext))) {
      files.push(fullPath);
    }
  }

  return files;
}

// ============================================================================
// CHECKS
// ============================================================================

console.log('\n📋 Standards Compliance Audit\n');
console.log('━'.repeat(50));

// Check 1: TypeScript strict mode (check tsconfig.app.json where strict is configured)
console.log('\n§1.1 TypeScript Standards');
try {
  const raw = readFileSync(join(ROOT, 'tsconfig.app.json'), 'utf-8');
  // Strip block and line comments so standard JSON.parse works on JSONC
  const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const tsconfigApp = JSON.parse(stripped);
  if (tsconfigApp.compilerOptions?.strict === true) {
    pass('TypeScript strict mode enabled');
  } else {
    fail('TypeScript strict mode not enabled');
  }
} catch {
  warn('Could not read tsconfig.app.json');
}

// Check 2: Forbidden patterns
console.log('\n§1.1 Forbidden Patterns');
const srcFiles = getAllFiles(SRC);

for (const { pattern, name, message } of CONFIG.forbiddenPatterns) {
  let totalMatches = 0;
  const matchedFiles = [];

  for (const file of srcFiles) {
    const content = readFileSync(file, 'utf-8');
    const matches = content.match(pattern);
    if (matches) {
      totalMatches += matches.length;
      matchedFiles.push({ file: relative(ROOT, file), count: matches.length });
    }
  }

  if (totalMatches === 0) {
    pass(`No ${name} found`);
  } else {
    warn(`Found ${totalMatches} ${name} in ${matchedFiles.length} files — ${message}`);
    matchedFiles.forEach((f) => console.log(`   - ${f.file}: ${f.count}`));
  }
}

// Check 3: File length (excludes generated shadcn primitives in src/components/ui/)
console.log(`\n§1.3 File Length (max ${CONFIG.maxFileLines} lines)`);
let longFiles = 0;

for (const file of srcFiles) {
  if (file.includes(`${CONFIG.srcDir}/components/ui/`)) continue;
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n').length;

  if (lines > CONFIG.maxFileLines) {
    fail(`${relative(ROOT, file)}: ${lines} lines (max ${CONFIG.maxFileLines})`);
    longFiles++;
  }
}

if (longFiles === 0) {
  pass(`All files under ${CONFIG.maxFileLines} lines`);
}

// Check 4: JSDoc documentation (for lib and scheduler files)
console.log('\n§1.4 JSDoc Documentation');
const jsdocDirs = [join(SRC, 'lib'), join(SRC, 'scheduler')];
const existingJsdocDirs = jsdocDirs.filter(existsSync);

if (existingJsdocDirs.length === 0) {
  warn('No src/lib or src/scheduler directory found for JSDoc check');
} else {
  const jsdocFiles = existingJsdocDirs.flatMap(dir => getAllFiles(dir));
  let undocumented = 0;

  for (const file of jsdocFiles) {
    // Skip test files
    if (file.includes('__tests__') || file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
    const content = readFileSync(file, 'utf-8');
    const exportedFunctions = content.match(/export\s+(async\s+)?(?:function\s+\w+|const\s+\w+\s*[:=])/g) || [];
    const jsdocComments = content.match(/\/\*\*[\s\S]*?\*\//g) || [];

    if (exportedFunctions.length > jsdocComments.length) {
      warn(
        `${relative(ROOT, file)}: ${exportedFunctions.length} exports, ${jsdocComments.length} JSDoc blocks`
      );
      undocumented++;
    }
  }

  if (undocumented === 0) {
    pass('All exported functions have JSDoc');
  }
}

// Check 5: Test files exist (vitest colocated in __tests__ or *.test.ts)
console.log('\n§2.1 Test Coverage');
const testFiles = getAllFiles(SRC, ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx']);
if (testFiles.length > 0) {
  pass(`Found ${testFiles.length} test file(s)`);
} else {
  warn('No test files found under src/');
}

// Check 6: Required files
console.log('\n§4.1 Required Files');
for (const requiredFile of CONFIG.requiredFiles) {
  const fullPath = join(ROOT, requiredFile);
  if (existsSync(fullPath)) {
    pass(`${requiredFile} exists`);
  } else {
    fail(`${requiredFile} not found`);
  }
}

// Check 7: Optional files
console.log('\n§3.5 Optional Files');
for (const optionalFile of CONFIG.optionalFiles) {
  const fullPath = join(ROOT, optionalFile);
  if (existsSync(fullPath)) {
    pass(`${optionalFile} exists`);
  } else {
    warn(`${optionalFile} not found (optional)`);
  }
}

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '━'.repeat(50));
console.log('\n📊 Summary\n');
console.log(`${GREEN}Passed:${RESET}   ${passes}`);
console.log(`${YELLOW}Warnings:${RESET} ${warnings}`);
console.log(`${RED}Failed:${RESET}   ${failures}`);

const total = passes + warnings + failures;
const compliance = Math.round((passes / total) * 100);
console.log(`\nCompliance: ${compliance}%`);

if (failures > 0) {
  console.log(`\n${RED}Standards audit failed with ${failures} issue(s)${RESET}\n`);
  process.exit(1);
} else if (warnings > 0) {
  console.log(`\n${YELLOW}Standards audit passed with ${warnings} warning(s)${RESET}\n`);
  process.exit(0);
} else {
  console.log(`\n${GREEN}Standards audit passed!${RESET}\n`);
  process.exit(0);
}
