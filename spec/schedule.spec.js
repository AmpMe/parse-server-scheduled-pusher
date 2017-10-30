/* eslint-disable max-len */
const Parse = require('parse/node');
const { dropDB } = require('parse-server-test-runner');

const {
  getCurrentOffsets,
  getUnsentOffsets,
  createPushWorkItems,
} = require('../src/schedule');
const { getScheduledPushes } = require('../src/query');

const { stripTimezone } = require('./util');

describe('getUnsentOffsets', () => {
  const sentPerUTCOffset = {
    0: 123,
    60: 99,
    120: 0, // queued but PushStatus not updated
  };

  const unsentOffsets = getUnsentOffsets(sentPerUTCOffset);
  it('should not contain already sent offsets', () => {
    for (const sentOffset of Object.keys(unsentOffsets)) {
      expect(unsentOffsets).not.toContain(sentOffset);
    }
  });
});

describe('getCurrentOffsets', () => {
  const sentPerUTCOffset = {};
  const allOffsets = getUnsentOffsets(sentPerUTCOffset); // All the offsets

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
        .toEqual([ '0', '60' ]);
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
      push_time: stripTimezone(pushTime),
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
        const pushWorkItem = createPushWorkItems(pushStatus, 'appId', now)[0];

        const expectedKeys = [ 'body', 'query', 'pushStatus', 'UTCOffset', 'applicationId' ];
        const actualKeys = Object.keys(pushWorkItem);
        expectedKeys.forEach((key) => expect(actualKeys).toContain(key, `PushWorkItem doesn't contain ${key}`));

        expect(pushWorkItem.UTCOffset).toBeDefined();
        expect(pushWorkItem.UTCOffset).toBe('180', 'current offset (180) is not included');

        expect(pushWorkItem.query.where.timeZone).toBeDefined('Query should have timeZone constraint');
        expect(pushWorkItem.query.where.timeZone.$in).toBeDefined('Timezone should be a "containedIn" query');
        expect(pushWorkItem.query.where.timeZone.$in).toContain('America/Halifax', '"timezone" constraint should have Halifax');
      })
      .then(done).catch(done.fail);
  });

  it('should respect existing timezones constraint', (done) => {
    const now = new Date('2017-07-20T12:20:40.730Z');
    const pushTime = new Date(now);
    pushTime.setHours(9);
    pushTime.setMinutes(20);

    const notificationA = {
      push_time: stripTimezone(pushTime),
      where: {
        createdAt: { $gt: { __type: 'Date', iso: '2017-06-21T14:23:00.000Z' } },
        timeZone: 'America/Halifax',
      },
      data: {
        alert: 'Alert!!!!!',
        uri: 'foo://bar?baz=qux',
        url: 'foo://bar?baz=qux',
        type: 'bar',
      },
    };

    const notificationB = {
      push_time: stripTimezone(pushTime),
      where: {
        createdAt: { $gt: { __type: 'Date', iso: '2017-06-21T14:23:00.000Z' } },
        timeZone: {
          $in: [ 'America/Halifax', 'America/Goose_Bay', 'America/Montreal' ],
        },
      },
      data: {
        alert: 'Alert!!!!!',
        uri: 'foo://bar?baz=qux',
        url: 'foo://bar?baz=qux',
        type: 'bar',
      },
    };

    Promise.all([
      Parse.Push.send(notificationA, { useMasterKey: true }),
      Parse.Push.send(notificationB, { useMasterKey: true }),
    ])
      .then(getScheduledPushes)
      .then(([ a, b ]) => {
        const [ pwiA ] = createPushWorkItems(a, 'appId', now);
        const [ pwiB ] = createPushWorkItems(b, 'appId', now);

        expect(pwiA.query.where.timeZone.$in).toEqual([ 'America/Halifax' ]);
        expect(pwiB.query.where.timeZone.$in.sort()).toEqual([ 'America/Goose_Bay', 'America/Halifax' ]);
      })
      .then(done, done.fail);
  });
});
