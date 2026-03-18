import { describe, expect, it } from 'vitest';

const { computeSaleStatus } = require('../../src/utils/sale-status');

describe('computeSaleStatus', () => {
  const startTime = new Date('2026-03-17T10:00:00.000Z');
  const endTime = new Date('2026-03-17T11:00:00.000Z');

  it('returns upcoming before the sale start time', () => {
    expect(
      computeSaleStatus({
        now: new Date('2026-03-17T09:59:59.999Z'),
        startTime,
        endTime,
        remainingStock: 10,
      }),
    ).toBe('upcoming');
  });

  it('returns active at the exact sale start time when stock is positive', () => {
    expect(
      computeSaleStatus({
        now: startTime,
        startTime,
        endTime,
        remainingStock: 10,
      }),
    ).toBe('active');
  });

  it('returns sold_out at the exact sale start time when stock is zero', () => {
    expect(
      computeSaleStatus({
        now: startTime,
        startTime,
        endTime,
        remainingStock: 0,
      }),
    ).toBe('sold_out');
  });

  it('returns active at the exact sale end time when stock is positive', () => {
    expect(
      computeSaleStatus({
        now: endTime,
        startTime,
        endTime,
        remainingStock: 1,
      }),
    ).toBe('active');
  });

  it('returns sold_out at the exact sale end time when stock is zero', () => {
    expect(
      computeSaleStatus({
        now: endTime,
        startTime,
        endTime,
        remainingStock: 0,
      }),
    ).toBe('sold_out');
  });

  it('returns sold_out within the sale window when stock is zero', () => {
    expect(
      computeSaleStatus({
        now: new Date('2026-03-17T10:30:00.000Z'),
        startTime,
        endTime,
        remainingStock: 0,
      }),
    ).toBe('sold_out');
  });

  it('returns sold_out within the sale window when stock is negative', () => {
    expect(
      computeSaleStatus({
        now: new Date('2026-03-17T10:30:00.000Z'),
        startTime,
        endTime,
        remainingStock: -1,
      }),
    ).toBe('sold_out');
  });

  it('returns ended after the sale end time', () => {
    expect(
      computeSaleStatus({
        now: new Date('2026-03-17T11:00:00.001Z'),
        startTime,
        endTime,
        remainingStock: 10,
      }),
    ).toBe('ended');
  });

  it('rejects missing input', () => {
    expect(() => computeSaleStatus()).toThrow(TypeError);
  });
});
