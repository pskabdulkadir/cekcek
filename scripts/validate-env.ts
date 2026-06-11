#!/usr/bin/env tsx
/**
 * @file validate-env.ts
 * @description Validates all environment configuration before starting the bot
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env file
const envPath = path.join(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  console.error('❌ .env file not found! Please create it from .env.example');
  process.exit(1);
}

dotenv.config({ path: envPath });

interface ValidationResult {
  name: string;
  required: boolean;
  value: string | undefined;
  valid: boolean;
  error?: string;
}

const results: ValidationResult[] = [];

// Validation functions
const validateAddress = (addr?: string): { valid: boolean; error?: string } => {
  if (!addr) return { valid: false, error: 'Empty address' };
  if (!addr.startsWith('0x')) return { valid: false, error: 'Must start with 0x' };
  if (addr.length !== 42) return { valid: false, error: 'Invalid length (must be 42 chars)' };
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return { valid: false, error: 'Invalid hex format' };
  return { valid: true };
};

const validatePrivateKey = (key?: string): { valid: boolean; error?: string } => {
  if (!key) return { valid: false, error: 'Empty private key' };
  const cleanKey = key.startsWith('0x') ? key : '0x' + key;
  if (cleanKey.length !== 66) return { valid: false, error: 'Invalid length (must be 66 chars with 0x)' };
  if (!/^0x[a-fA-F0-9]{64}$/.test(cleanKey)) return { valid: false, error: 'Invalid hex format' };
  return { valid: true };
};

const validateUrl = (url?: string): { valid: boolean; error?: string } => {
  if (!url) return { valid: false, error: 'Empty URL' };
  try {
    new URL(url);
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
};

const validateNumber = (num?: string, min?: number, max?: number): { valid: boolean; error?: string } => {
  if (!num) return { valid: false, error: 'Empty value' };
  const parsed = parseInt(num, 10);
  if (isNaN(parsed)) return { valid: false, error: 'Not a number' };
  if (min !== undefined && parsed < min) return { valid: false, error: `Must be >= ${min}` };
  if (max !== undefined && parsed > max) return { valid: false, error: `Must be <= ${max}` };
  return { valid: true };
};

// Validation schema
const validationSchema = [
  // Network & Chain
  {
    name: 'CHAIN_ID',
    required: true,
    validate: (v?: string) => validateNumber(v, 1, 999999),
  },
  {
    name: 'POLYGON_RPC_URL',
    required: true,
    validate: validateUrl,
  },
  {
    name: 'PROVIDER_1_URL',
    required: true,
    validate: validateUrl,
  },
  {
    name: 'PROVIDER_2_URL',
    required: false,
    validate: validateUrl,
  },

  // Contract Addresses
  {
    name: 'CONTRACT_ADDRESS',
    required: true,
    validate: validateAddress,
  },
  {
    name: 'GREEN_TOKEN_ADDRESS',
    required: true,
    validate: validateAddress,
  },
  {
    name: 'ROUTER_ADDRESS',
    required: true,
    validate: validateAddress,
  },
  {
    name: 'PAYOUT_WALLET',
    required: true,
    validate: validateAddress,
  },
  {
    name: 'ACCOUNT_ADDRESS',
    required: true,
    validate: validateAddress,
  },

  // Private Key (only if PRODUCTION_MODE=true)
  {
    name: 'PRIVATE_KEY',
    required: process.env.PRODUCTION_MODE === 'true',
    validate: validatePrivateKey,
  },

  // Database
  {
    name: 'MONGO_URI',
    required: process.env.NODE_ENV === 'production',
    validate: validateUrl,
  },

  // API Endpoints
  {
    name: 'ONEINCH_API',
    required: false,
    validate: validateUrl,
  },
  {
    name: 'PARASWAP_API',
    required: false,
    validate: validateUrl,
  },
];

// Run validations
console.log('🔍 Validating environment configuration...\n');

for (const schema of validationSchema) {
  const value = process.env[schema.name];
  const validation = schema.validate(value);

  results.push({
    name: schema.name,
    required: schema.required,
    value: value ? `${value.substring(0, 20)}...` : undefined,
    valid: validation.valid,
    error: validation.error,
  });
}

// Print results
let hasErrors = false;
let hasWarnings = false;

console.log('📋 Validation Results:');
console.log('═'.repeat(80));

for (const result of results) {
  const status = result.valid ? '✅' : result.required ? '❌' : '⚠️';
  const required = result.required ? '(REQUIRED)' : '(optional)';
  
  if (result.valid) {
    console.log(`${status} ${result.name.padEnd(30)} ${required.padEnd(15)} ${result.value || 'SET'}`);
  } else {
    console.log(`${status} ${result.name.padEnd(30)} ${required.padEnd(15)} ${result.error}`);
    if (result.required) {
      hasErrors = true;
    } else {
      hasWarnings = true;
    }
  }
}

console.log('═'.repeat(80));

// Summary
console.log('\n📊 Summary:');
const validCount = results.filter(r => r.valid).length;
const errorCount = results.filter(r => !r.valid && r.required).length;
const warningCount = results.filter(r => !r.valid && !r.required).length;

console.log(`✅ Valid: ${validCount}/${results.length}`);
if (errorCount > 0) console.log(`❌ Errors: ${errorCount}`);
if (warningCount > 0) console.log(`⚠️  Warnings: ${warningCount}`);

// Exit status
if (hasErrors) {
  console.log('\n❌ Configuration validation FAILED - Fix required fields above');
  process.exit(1);
} else if (hasWarnings) {
  console.log('\n⚠️  Configuration has warnings - Bot may not work optimally');
  console.log('💡 Recommend setting all optional fields for best performance\n');
  process.exit(0);
} else {
  console.log('\n✅ All validations passed! Configuration is ready.');
  console.log('🚀 You can now start the bot with: npm run dev\n');
  process.exit(0);
}
