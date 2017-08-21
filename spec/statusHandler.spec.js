const Parse = require('parse/node');
const Config = require('parse-server/lib/Config');
const { dropDB } = require('parse-server-test-runner');

const { getScheduledPushes } = require('../src/query');
const { addOffsetCounts, markAsComplete, trackSent } = require('../src/statusHandler');

describe('statusHandler', () => {
  function sendNotification() {
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

    return Parse.Push.send(notification, { useMasterKey: true });
  }

  beforeAll((done) => {
    dropDB().then(done).catch(done.fail);
  });

  describe('addOffsetCounts', () => {
    it('should set the success/failure counts to 0 if not previously set', (done) => {
      const config = new Config('test', '/1');
      sendNotification()
        .then(getScheduledPushes)
        .then(([ pushStatus ]) => {
          expect(pushStatus.get('sentPerOffset')).toBeUndefined();
          expect(pushStatus.get('failedPerOffset')).toBeUndefined();

          return addOffsetCounts(pushStatus.id, 180, config.database);
        })
        .then(getScheduledPushes)
        .then(([ pushStatus ]) => {
          expect(pushStatus.get('sentPerOffset')['180']).toBe(0);
          expect(pushStatus.get('failedPerOffset')['180']).toBe(0);
        })
        .then(done)
        .catch(done.fail);
    });
  });

  describe('trackSent', () => {
    it('should increment the counts', (done) => {
      sendNotification()
        .then(getScheduledPushes)
        .then(([ pushStatus ]) => {
          const config = new Config('test', '/1');
          const results = [ { transmitted: true }, { transmitted: false }, { transmitted: true } ];
          return trackSent(pushStatus.id, 180, results, config.database);
        })
        .then(getScheduledPushes)
        .then(([ pushStatus ]) => {
          expect(pushStatus.get('sentPerOffset')['180']).toBe(2);
          expect(pushStatus.get('failedPerOffset')['180']).toBe(1);
        })
        .catch(done.fail)
        .then(done);
    }, 5 * 1000);
  });

  describe('markAsComplete', () => {
    const longTimeAgo = new Date(0);
    const now = new Date('2017-07-20T12:20:40.730Z');

    function fetch(objectId, database) {
      return database.find('_PushStatus', { objectId }, { limit: 1 })
        .then(([ pushStatus ]) => Parse.Object.fromJSON(Object.assign({ className: '_PushStatus' }, pushStatus)));
    }

    function send(objectId, pushTime, database) {
      return database.create('_PushStatus', { pushTime, objectId }, {})
        .then(() => fetch(objectId, database));
    }

    it('should not mark recently scheduled PushStatus', (done) => {
      const config = new Config('test', '/1');
      const objectId = 'RImUFHUEtd';

      send(objectId, now, config.database)
        .then((pushStatus) => markAsComplete(pushStatus, config.database, now))
        .then((result) => expect(result).toBe(false))
        .then(done, done.fail);
    });

    it('should mark failed Push', (done) => {
      const config = new Config('test', '/1');
      const objectId = '4VcMrkO432';

      send(objectId, longTimeAgo, config.database)
        .then(() => addOffsetCounts(objectId, 180, config.database, now))
        .then(() => trackSent(objectId, 180, [ { transmitted: false } ], config.database, now))
        .then(() => fetch(objectId, config.database))
        .then((pushStatus) => markAsComplete(pushStatus, config.database, now))

        .then((result) => expect(result).toBe(true))
        .then(() => fetch(objectId, config.database))
        .then((pushStatus) => expect(pushStatus.get('status')).toBe('failed'))
        .then(done, done.fail);
    });

    it('should mark successful Push', (done) => {
      const config = new Config('test', '/1');
      const objectId = '3DXht7WvuZ';

      send(objectId, longTimeAgo, config.database)
        .then(() => addOffsetCounts(objectId, 180, config.database, now))
        .then(() => trackSent(objectId, 180, [ { transmitted: true } ], config.database, now))

        .then(() => fetch(objectId, config.database))
        .then((pushStatus) => markAsComplete(pushStatus, config.database, now))
        .then((result) => expect(result).toBe(true))
        .then(() => fetch(objectId, config.database))
        .then((pushStatus) => expect(pushStatus.get('status')).toBe('succeeded'))
        .then(done, done.fail);
    });
  });
});
