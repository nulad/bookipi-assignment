import { describe, expect, it } from 'vitest';

const { InvalidRequestError } = require('../../src/errors/invalid-request-error');
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
    expect(() => normalizeUserId('')).toThrow('userId must be a non-empty string');
  });

  it('rejects a whitespace-only string', () => {
    expect(() => normalizeUserId('   ')).toThrow('userId must be a non-empty string');
  });

  it('rejects non-string input', () => {
    expect(() => normalizeUserId(null)).toThrow(InvalidRequestError);
  });

  it('rejects undefined input with the expected message', () => {
    expect(() => normalizeUserId(undefined)).toThrow('userId must be a non-empty string');
  });
});
