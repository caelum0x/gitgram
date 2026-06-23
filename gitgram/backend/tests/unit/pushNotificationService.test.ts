/**
 * Unit tests for pushNotificationService
 *
 * Prisma is mocked via tests/setup.ts (mockPrisma).
 * All tests run in-memory without database or network connections.
 */

import { mockPrisma } from '../setup';

// ---------------------------------------------------------------------------
// Service under test — imported after setup mocks are registered
// ---------------------------------------------------------------------------

import {
  registerWebPushToken,
  registerExpoPushToken,
  sendNotificationToUser,
  sendFollowNotification,
  sendLikeNotification,
  sendCommentNotification,
  sendMentionNotification,
  cleanupExpiredTokens,
  type PushSubscription,
  type PushNotificationPayload,
} from '../../src/services/pushNotificationService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedRows(model: any, rows: any[]): void {
  model.__rows.length = 0;
  model.__rows.push(...rows);
}

function clearAllTables(): void {
  (mockPrisma as any).pushDevice.__rows.length = 0;
}

function makeWebSubscription(overrides: Partial<PushSubscription> = {}): PushSubscription {
  return {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: {
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlTiGXjzKVoie4QI62y9nkicnnn7CsDelta3P',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    },
    ...overrides,
  };
}

function makePushDevice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'device-1',
    userId: 'user-1',
    pushToken: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    platform: 'IOS',
    active: true,
    deviceName: null,
    lastUsed: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeWebPushDevice(overrides: Record<string, unknown> = {}) {
  const sub = makeWebSubscription();
  return makePushDevice({
    id: 'device-web-1',
    pushToken: sub.endpoint,
    platform: 'WEB',
    deviceName: JSON.stringify(sub),
    ...overrides,
  });
}

const sampleNotification: PushNotificationPayload = {
  title: 'Test Notification',
  body: 'Hello from tests',
  data: { type: 'follow', targetId: 'user-2' },
};

// ---------------------------------------------------------------------------
// registerWebPushToken
// ---------------------------------------------------------------------------

describe('registerWebPushToken', () => {
  beforeEach(() => {
    clearAllTables();
  });

  it('creates a new WEB push device record', async () => {
    const sub = makeWebSubscription();

    await registerWebPushToken('user-1', sub);

    expect(mockPrisma.pushDevice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pushToken: sub.endpoint },
        create: expect.objectContaining({ userId: 'user-1', platform: 'WEB', active: true }),
        update: expect.objectContaining({ userId: 'user-1', active: true }),
      })
    );
  });

  it('stores serialized subscription JSON in deviceName', async () => {
    const sub = makeWebSubscription();

    await registerWebPushToken('user-1', sub);

    const upsertCall = (mockPrisma.pushDevice.upsert as jest.Mock).mock.calls[0][0];
    const stored = JSON.parse(upsertCall.create.deviceName);
    expect(stored.endpoint).toBe(sub.endpoint);
    expect(stored.keys.p256dh).toBe(sub.keys.p256dh);
  });

  it('updates an existing record when endpoint already exists', async () => {
    const sub = makeWebSubscription();
    seedRows(mockPrisma.pushDevice, [makeWebPushDevice({ pushToken: sub.endpoint })]);

    await registerWebPushToken('user-1', sub);

    expect(mockPrisma.pushDevice.upsert).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// registerExpoPushToken
// ---------------------------------------------------------------------------

describe('registerExpoPushToken', () => {
  beforeEach(() => {
    clearAllTables();
  });

  it('stores an iOS token with platform=IOS', async () => {
    await registerExpoPushToken('user-1', 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]');

    const upsertCall = (mockPrisma.pushDevice.upsert as jest.Mock).mock.calls[0][0];
    expect(upsertCall.create.platform).toBe('IOS');
  });

  it('stores a non-Expo token with platform=ANDROID', async () => {
    await registerExpoPushToken('user-1', 'fcm_android_token_xyz');

    const upsertCall = (mockPrisma.pushDevice.upsert as jest.Mock).mock.calls[0][0];
    expect(upsertCall.create.platform).toBe('ANDROID');
  });

  it('marks the device as active on create', async () => {
    await registerExpoPushToken('user-1', 'ExponentPushToken[abc]');

    const upsertCall = (mockPrisma.pushDevice.upsert as jest.Mock).mock.calls[0][0];
    expect(upsertCall.create.active).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sendNotificationToUser
// ---------------------------------------------------------------------------

describe('sendNotificationToUser', () => {
  beforeEach(() => {
    clearAllTables();
  });

  it('resolves without action when the user has no devices', async () => {
    seedRows(mockPrisma.pushDevice, []);

    await expect(sendNotificationToUser('user-1', sampleNotification)).resolves.toBeUndefined();
    expect(mockPrisma.pushDevice.updateMany).not.toHaveBeenCalled();
  });

  it('dispatches to a single Expo device', async () => {
    seedRows(mockPrisma.pushDevice, [makePushDevice()]);

    await sendNotificationToUser('user-1', sampleNotification);

    // The simulated dispatchExpo always returns 'ok', so no deactivation call
    expect(mockPrisma.pushDevice.updateMany).not.toHaveBeenCalled();
  });

  it('dispatches to a single Web Push device', async () => {
    seedRows(mockPrisma.pushDevice, [makeWebPushDevice()]);

    await sendNotificationToUser('user-1', sampleNotification);

    expect(mockPrisma.pushDevice.updateMany).not.toHaveBeenCalled();
  });

  it('dispatches to mixed Expo and Web devices in parallel', async () => {
    seedRows(mockPrisma.pushDevice, [
      makePushDevice({ id: 'dev-ios' }),
      makeWebPushDevice({ id: 'dev-web' }),
    ]);

    await sendNotificationToUser('user-1', sampleNotification);

    // Both dispatches simulated as 'ok' — no cleanup needed
    expect(mockPrisma.pushDevice.updateMany).not.toHaveBeenCalled();
  });

  it('looks up devices filtered by userId and active=true', async () => {
    const inactiveDevice = makePushDevice({ id: 'dev-inactive', active: false });
    const activeDevice = makePushDevice({ id: 'dev-active', active: true });
    seedRows(mockPrisma.pushDevice, [inactiveDevice, activeDevice]);

    await sendNotificationToUser('user-1', sampleNotification);

    const findManyCall = (mockPrisma.pushDevice.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where).toMatchObject({ userId: 'user-1', active: true });
  });

  it('handles malformed Web Push deviceName JSON gracefully', async () => {
    seedRows(mockPrisma.pushDevice, [
      makeWebPushDevice({ deviceName: '{invalid-json' }),
    ]);

    await expect(sendNotificationToUser('user-1', sampleNotification)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Convenience notification helpers
// ---------------------------------------------------------------------------

describe('sendFollowNotification', () => {
  beforeEach(() => {
    clearAllTables();
    seedRows(mockPrisma.pushDevice, [makePushDevice()]);
  });

  it('sends a "New Follower" notification to the target user', async () => {
    await sendFollowNotification('user-1', 'bob');

    const findManyCall = (mockPrisma.pushDevice.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.userId).toBe('user-1');
  });

  it('resolves when target user has no devices', async () => {
    seedRows(mockPrisma.pushDevice, []);

    await expect(sendFollowNotification('user-ghost', 'bob')).resolves.toBeUndefined();
  });
});

describe('sendLikeNotification', () => {
  beforeEach(() => {
    clearAllTables();
    seedRows(mockPrisma.pushDevice, [makePushDevice()]);
  });

  it('sends a "New Like" notification referencing the post', async () => {
    await sendLikeNotification('user-1', 'alice', 'post-99');

    const findManyCall = (mockPrisma.pushDevice.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.userId).toBe('user-1');
  });
});

describe('sendCommentNotification', () => {
  beforeEach(() => {
    clearAllTables();
    seedRows(mockPrisma.pushDevice, [makePushDevice()]);
  });

  it('sends a "New Comment" notification for a post', async () => {
    await sendCommentNotification('user-1', 'carol', 'post-55');

    const findManyCall = (mockPrisma.pushDevice.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.userId).toBe('user-1');
  });
});

describe('sendMentionNotification', () => {
  beforeEach(() => {
    clearAllTables();
    seedRows(mockPrisma.pushDevice, [makePushDevice()]);
  });

  it('sends a "You were mentioned" notification', async () => {
    await sendMentionNotification('user-1', 'dave', 'post-77');

    const findManyCall = (mockPrisma.pushDevice.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.userId).toBe('user-1');
  });
});

// ---------------------------------------------------------------------------
// cleanupExpiredTokens
// ---------------------------------------------------------------------------

describe('cleanupExpiredTokens', () => {
  beforeEach(() => {
    clearAllTables();
  });

  it('deletes all inactive push device records', async () => {
    seedRows(mockPrisma.pushDevice, [
      makePushDevice({ id: 'dev-1', active: false }),
      makePushDevice({ id: 'dev-2', active: false }),
      makePushDevice({ id: 'dev-3', active: true }),
    ]);

    const count = await cleanupExpiredTokens();

    expect(mockPrisma.pushDevice.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: false } })
    );
    expect(typeof count).toBe('number');
  });

  it('returns 0 when there are no inactive tokens', async () => {
    seedRows(mockPrisma.pushDevice, [
      makePushDevice({ id: 'dev-active', active: true }),
    ]);

    const count = await cleanupExpiredTokens();

    expect(count).toBe(0);
  });

  it('returns the correct count of deleted records', async () => {
    seedRows(mockPrisma.pushDevice, [
      makePushDevice({ id: 'dev-gone-1', active: false }),
      makePushDevice({ id: 'dev-gone-2', active: false }),
    ]);

    const count = await cleanupExpiredTokens();

    expect(count).toBe(2);
  });
});
