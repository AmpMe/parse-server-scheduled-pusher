/* eslint-disable max-len */
const Parse = require('parse/node');
const { dropDB } = require('parse-server-test-runner');

const { getScheduledPushes } = require('../src/query');
const { addOffsetCounts, markAsComplete } = require('../src/statusHandler');

const { stripTimezone } = require('./util');

describe('statusHandler', () => {
  function send(pushTime, inLocalTime=true) {
    const pushStatus = new Parse.Object('_PushStatus');
    return pushStatus.save({
      pushTime: inLocalTime ? stripTimezone(pushTime) : pushTime.toISOString(),
      status: 'scheduled',
      query: '{}',
      payload: '{"alert":"alert!"}',
      title: 'title',
      expiry: +new Date(pushTime + 5000),
      numSent: 0,
      source: 'rest',
      pushHash: '1328bee6e66a1c8f6fa5d5546812e671',
    }, { useMasterKey: true });
  }

  beforeAll((done) => {
    dropDB().then(done).catch(done.fail);
  });

  describe('addOffsetCounts', () => {
    it('should set the success/failure counts to 0 if not previously set', (done) => {
      const now = new Date('2017-07-20T12:20:40.730Z');
      send(new Date(now + 5000))
        .then(getScheduledPushes)
        .then(([ pushStatus ]) => {
          expect(pushStatus.get('sentPerUTCOffset')).toBeUndefined();
          expect(pushStatus.get('failedPerUTCOffset')).toBeUndefined();

          return addOffsetCounts(pushStatus, 180);
        })
        .then(getScheduledPushes)
        .then(([ pushStatus ]) => {
          expect(pushStatus.get('sentPerUTCOffset')['180']).toBe(0);
          expect(pushStatus.get('failedPerUTCOffset')['180']).toBe(0);
        })
        .then(done)
        .catch(done.fail);
    });
  });

  describe('markAsComplete', () => {
    const longTimeAgo = new Date(0);
    const now = new Date('2017-07-20T12:20:40.730Z');

    it('should not mark recently scheduled PushStatus', (done) => {
      send(now)
        .then((pushStatus) => markAsComplete(pushStatus, now))
        .then((result) => expect(result).toBe(false))
        .then(done, done.fail);
    });

    it('should mark failed Push', (done) => {
      let pushStatus;
      send(longTimeAgo)
        .then((p) => pushStatus = p)
        .then(() => addOffsetCounts(pushStatus, 180))
        .then(() => markAsComplete(pushStatus, now))
        .then((result) => expect(result).toBe(true))
        .then(() => pushStatus.fetch({ useMasterKey: true }))
        .then((pushStatus) => expect(pushStatus.get('status')).toBe('failed'))
        .then(done, done.fail);
    });

    it('should mark successful Push', (done) => {
      let pushStatus;
      send(longTimeAgo)
        .then((p) => pushStatus = p)
        .then(() => addOffsetCounts(pushStatus, 180))
        .then(() => {
          const sentPerUTCOffset = {};
          sentPerUTCOffset[180] = 10;
          return pushStatus.save({ sentPerUTCOffset }, { useMasterKey: true });
        })
        .then(() => pushStatus.fetch({ useMasterKey: true }))
        .then((pushStatus) => markAsComplete(pushStatus, now))
        .then((result) => expect(result).toBe(true))
        .then(() => pushStatus.fetch({ useMasterKey: true }))
        .then((pushStatus) => expect(pushStatus.get('status')).toBe('succeeded'))
        .then(done, done.fail);
    });
  });
});

