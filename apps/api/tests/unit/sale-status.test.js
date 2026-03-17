import { describe, expect, it } from 'vitest';

const { getSaleStatus } = require('../../src/utils/sale-status');

describe('getSaleStatus', () => {
  const startTime = new Date('2026-03-17T10:00:00.000Z');
  const endTime = new Date('2026-03-17T11:00:00.000Z');

  it('returns upcoming before the sale start time', () => {
    expect(
      getSaleStatus({
        now: new Date('2026-03-17T09:59:59.999Z'),
        startTime,
        endTime,
        remainingStock: 10,
      }),
    ).toBe('upcoming');
  });

  it('returns active at the exact sale start time when stock is positive', () => {
    expect(
      getSaleStatus({
        now: startTime,
        startTime,
        endTime,
        remainingStock: 10,
      }),
    ).toBe('active');
  });

  it('returns sold_out at the exact sale start time when stock is zero', () => {
    expect(
      getSaleStatus({
        now: startTime,
        startTime,
        endTime,
        remainingStock: 0,
      }),
    ).toBe('sold_out');
  });

  it('returns active at the exact sale end time when stock is positive', () => {
    expect(
      getSaleStatus({
        now: endTime,
        startTime,
        endTime,
        remainingStock: 1,
      }),
    ).toBe('active');
  });

  it('returns sold_out at the exact sale end time when stock is zero', () => {
    expect(
      getSaleStatus({
        now: endTime,
        startTime,
        endTime,
        remainingStock: 0,
      }),
    ).toBe('sold_out');
  });

  it('returns sold_out within the sale window when stock is zero', () => {
    expect(
      getSaleStatus({
        now: new Date('2026-03-17T10:30:00.000Z'),
        startTime,
        endTime,
        remainingStock: 0,
      }),
    ).toBe('sold_out');
  });

  it('returns sold_out within the sale window when stock is negative', () => {
    expect(
      getSaleStatus({
        now: new Date('2026-03-17T10:30:00.000Z'),
        startTime,
        endTime,
        remainingStock: -1,
      }),
    ).toBe('sold_out');
  });

  it('returns ended after the sale end time', () => {
    expect(
      getSaleStatus({
        now: new Date('2026-03-17T11:00:00.001Z'),
        startTime,
        endTime,
        remainingStock: 10,
      }),
    ).toBe('ended');
  });

  it('rejects missing input', () => {
    expect(() => getSaleStatus()).toThrow(TypeError);
  });
});
