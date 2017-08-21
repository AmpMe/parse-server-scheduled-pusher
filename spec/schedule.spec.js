/* eslint-disable max-len */
const Parse = require('parse/node');
const Config = require('parse-server/lib/Config');
const { master } = require('parse-server/lib/Auth');
const { create } = require('parse-server/lib/rest');
const { dropDB } = require('parse-server-test-runner');

const {
  getCurrentOffsets,
  getUnsentOffsets,
  createPushWorkItems,
  batchPushWorkItem,
} = require('../src/schedule');
const { getScheduledPushes } = require('../src/query');

describe('getUnsentOffsets', () => {
  const sentPerOffset = {
    0: 123,
    60: 99,
    120: 0, // queued but PushStatus not updated
  };

  const unsentOffsets = getUnsentOffsets(sentPerOffset);
  it('should not contain already sent offsets', () => {
    for (const sentOffset of Object.keys(unsentOffsets)) {
      expect(unsentOffsets).not.toContain(sentOffset);
    }
  });
});

describe('getCurrentOffsets', () => {
  const sentPerOffset = {};
  const allOffsets = getUnsentOffsets(sentPerOffset); // All the offsets

  describe('30 minute offsets', () => {
    it('should only include Pakistan', () => {
      /**
       * The push should be sent at 5:20 PM.
       * It is currently 12:20 PM UTC.
       * Only Pakistan, Russia, etc. should be included. (+5:00 UTC) (-300 minutes)
       */
      const now = new Date('2017-07-20T12:20:40.730Z');
      const pushTime = new Date(now);
      pushTime.setHours(17);
      pushTime.setMinutes(20);

      const offsetsToSend = getCurrentOffsets(allOffsets, pushTime, now);
      expect(offsetsToSend).toEqual([
        '-300', // +5:00 UTC
      ]);
    });

    it('should only include India', () => {
      /**
       * The push should be sent at 5:50 PM.
       * It is currently 12:20 PM UTC.
       * Only India should be included. (+5:30 UTC) (-330 minutes)
       */
      const now = new Date('2017-07-20T12:20:40.730Z');
      const pushTime = new Date(now);
      pushTime.setHours(17);
      pushTime.setMinutes(50);

      const offsetsToSend = getCurrentOffsets(allOffsets, pushTime, now);
      expect(offsetsToSend).toEqual([
        '-330', // India, +5:30 UTC
      ]);
    });

    it('should only include Newfoundland', () => {
      /**
       * The push should be sent at 8:40 PM local time.
       * It is currently 11:10 PM UTC.
       * Only Newfoundland should be included.
       */
      const now = new Date('2017-07-20T23:10:40.730Z');
      const pushTime = new Date(now);
      pushTime.setHours(20);
      pushTime.setMinutes(40);

      const offsetsToSend = getCurrentOffsets(allOffsets, pushTime, now);
      expect(offsetsToSend).toEqual([
        '150', // Newfoundland, -2:30 UTC
      ]);
    });
  });

  describe('60 minutes offset', () => {
    const now = new Date('2017-07-20T12:10:40.730Z');
    const pushTime = new Date(now);
    pushTime.setHours(14);

    it('should return -120 offset', () => {
      const offsetsToSend = getCurrentOffsets(allOffsets, pushTime, now);
      expect(offsetsToSend).toEqual([ '-120' ]);
    });
  });

  describe('Able to send notifications for up to 5 minutes past the desired pushTime', () => {
    const now = new Date('2017-07-20T12:15:40.730Z');

    it('At 5 minutes past, there should be no offsets', () => {
      const fiveMinutesAgo = new Date(now);
      fiveMinutesAgo.setMinutes(now.getMinutes() - 5);
      expect(getCurrentOffsets(allOffsets, fiveMinutesAgo, now))
        .toEqual([]);
    });

    it('At 3 minutes past, there should be 1 valid offset', () => {
      const threeMinutesAgo = new Date(now);
      threeMinutesAgo.setMinutes(now.getMinutes() - 3);
      threeMinutesAgo.setSeconds(22);
      expect(getCurrentOffsets(allOffsets, threeMinutesAgo, now))
        .toEqual([ '0' ]);
    });
  });
});

describe('createPushWorkItems', () => {
  beforeEach((done) => {
    dropDB().then(done, done.fail);
  });

  it('should produce a valid PushWorkItem', (done) => {
    const now = new Date('2017-07-20T12:20:40.730Z');
    const pushTime = new Date(now);
    pushTime.setHours(9);
    pushTime.setMinutes(20);

    const notification = {
      push_time: pushTime,
      where: { createdAt: { $gt: { __type: 'Date', iso: '2017-06-21T14:23:00.000Z' } } },
      data: {
        alert: 'Alert!!!!!',
        uri: 'foo://bar?baz=qux',
        url: 'foo://bar?baz=qux',
        type: 'bar',
      },
    };

    Parse.Push.send(notification, { useMasterKey: true })
      .then(getScheduledPushes)
      .then((scheduledPushes) => {
        expect(scheduledPushes.length).toBe(1, 'There should be only 1 PushStatus');

        const [ pushStatus ] = scheduledPushes;
        const pushWorkItem = createPushWorkItems(pushStatus, now)[0];

        const expectedKeys = [ 'body', 'query', 'pushStatus', 'offset' ];
        const actualKeys = Object.keys(pushWorkItem);
        expectedKeys.forEach((key) => expect(actualKeys).toContain(key, `PushWorkItem doesn't contain ${key}`));

        expect(pushWorkItem.offset).toBeDefined();
        expect(pushWorkItem.offset).toBe('180', 'current offset (180) is not included');

        expect(pushWorkItem.query.where.timeZone).toBeDefined('Query should have timeZone constraint');
        expect(pushWorkItem.query.where.timeZone.$in).toBeDefined('Timezone should be a "containedIn" query');
        expect(pushWorkItem.query.where.timeZone.$in).toContain('America/Halifax', '"timezone" constraint should have Halifax');
      })
      .then(done).catch(done.fail);
  });
});

describe('batchPushWorkItem', () => {
  it('should take one PushWorkItem and produce paginated PushWorkItems', (done) => {
    const pwi = require('./fixtures/pushWorkItem.json');
    const installations = require('./fixtures/installations.json');
    const config = new Config('test', '/1');

    // Remove special Parse fields like '_created_at' and '_updated_at'
    Object.keys(installations).forEach((key) => {
      if (key.startsWith('_')) {
        delete installations[key];
      }
    });

    return dropDB()
      .then(() => Promise.all(installations.map((i) => create(config, master(config), '_Installation', {
        deviceToken: i.deviceToken,
        deviceType: i.deviceType,
        timeZone: i.timeZone,
      }))))
      .then(() => batchPushWorkItem(pwi, config, 3))
      .then((batches) => {
        expect(batches.length).toBeDefined('Batches should be an Array');
        expect(batches.length).toEqual(5);

        const sum = batches.reduce((acc, batch) => batch.query.limit + acc, 0);
        expect(sum).toBe(15);

        batches.forEach((batch) => {
          expect(batch.applicationId).toEqual('test', 'Batch applicationId should match config');
          expect(batch.query.limit).toEqual(3);
        });
      })
      .then(done)
      .catch(done.fail);
  }, 5000 * 10);
});
