import { describe, expect, it } from 'vitest';

const { normalizeUserId } = require('../../src/utils/normalize-user-id');

describe('normalizeUserId', () => {
  it('trims whitespace and lowercases the user id', () => {
    expect(normalizeUserId('  Alice@example.COM  ')).toBe('alice@example.com');
  });

  it('maps the same logical user to the same normalized value', () => {
    expect(normalizeUserId('Alice')).toBe(normalizeUserId(' alice '));
  });

  it('keeps a single non-whitespace character after normalization', () => {
    expect(normalizeUserId(' A ')).toBe('a');
  });

  it('rejects an empty string', () => {
    expect(() => normalizeUserId('')).toThrow('User ID cannot be empty');
  });

  it('rejects a whitespace-only string', () => {
    expect(() => normalizeUserId('   ')).toThrow('User ID cannot be empty');
  });

  it('rejects non-string input', () => {
    expect(() => normalizeUserId(null)).toThrow(TypeError);
  });

  it('rejects undefined input with the expected message', () => {
    expect(() => normalizeUserId(undefined)).toThrow('User ID must be a string');
  });
});
