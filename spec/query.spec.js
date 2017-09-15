const { dropDB } = require('parse-server-test-runner');
const Parse = require('parse/node');

const { getScheduledPushes } = require('../src/query');

describe('getScheduledPushes', () => {
  beforeEach((done) => {
    dropDB().then(done, done.fail);
  });

  // TODO add running + scheduled pushes
  it('should only pick scheduled pushes', (done) => {
    Promise.all([
      Parse.Push.send({
        where: { createdAt: { $gt: { __type: 'Date', iso: '2017-06-21T14:23:00.000Z' } } },
        data: {
          alert: 'Alert!!!!!',
          uri: 'foo://bar?baz=qux',
          url: 'foo://bar?baz=qux',
          type: 'bar',
        },
      }, { useMasterKey: true }),
      Parse.Push.send({
        push_time: new Date(),
        where: { createdAt: { $gt: { __type: 'Date', iso: '2017-06-21T14:23:00.000Z' } } },
        data: {
          alert: 'Alert!!!!!',
          uri: 'foo://bar?baz=qux',
          url: 'foo://bar?baz=qux',
          type: 'bar',
        },
      }, { useMasterKey: true }),
    ])
      .then(getScheduledPushes)
      .then((pushStatuses) => {
        expect(pushStatuses).toBeDefined();
        expect(pushStatuses.length).toBe(1);
      })
      .then(done)
      .catch(done.fail);
  });
});
