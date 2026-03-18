import { describe, expect, it, vi } from 'vitest';

const { getPurchaseStatus } = require('../../src/services/purchase-status.service');

function createDeps(overrides = {}) {
  return {
    normalizeUserId: vi.fn().mockImplementation((userId) => userId.trim().toLowerCase()),
    hasPurchaseForUserId: vi.fn(),
    ...overrides,
  };
}

describe('purchase-status.service', () => {
  it('normalizes the user id before querying Postgres', async () => {
    const deps = createDeps({
      normalizeUserId: vi.fn().mockReturnValue('alice@example.com'),
      hasPurchaseForUserId: vi.fn().mockResolvedValue(false),
    });

    await expect(
      getPurchaseStatus(
        {
          userId: ' Alice@example.com ',
        },
        deps,
      ),
    ).resolves.toEqual({
      userId: 'alice@example.com',
      hasPurchased: false,
    });

    expect(deps.normalizeUserId).toHaveBeenCalledWith(' Alice@example.com ');
    expect(deps.hasPurchaseForUserId).toHaveBeenCalledWith('alice@example.com');
  });

  it('returns hasPurchased false when no persisted purchases exist', async () => {
    const deps = createDeps({
      hasPurchaseForUserId: vi.fn().mockResolvedValue(false),
    });

    await expect(
      getPurchaseStatus(
        {
          userId: 'alice@example.com',
        },
        deps,
      ),
    ).resolves.toEqual({
      userId: 'alice@example.com',
      hasPurchased: false,
    });
  });

  it('returns hasPurchased true when a persisted purchase exists', async () => {
    const deps = createDeps({
      hasPurchaseForUserId: vi.fn().mockResolvedValue(true),
    });

    await expect(
      getPurchaseStatus(
        {
          userId: 'alice@example.com',
        },
        deps,
      ),
    ).resolves.toEqual({
      userId: 'alice@example.com',
      hasPurchased: true,
    });
  });

  it('bubbles normalization errors without querying Postgres', async () => {
    const deps = createDeps({
      normalizeUserId: vi.fn().mockImplementation(() => {
        throw new Error('userId must be a non-empty string');
      }),
    });

    await expect(
      getPurchaseStatus(
        {
          userId: '   ',
        },
        deps,
      ),
    ).rejects.toThrow('userId must be a non-empty string');

    expect(deps.hasPurchaseForUserId).not.toHaveBeenCalled();
  });
});
