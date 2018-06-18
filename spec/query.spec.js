const { dropDB } = require('parse-server-test-runner');
const Parse = require('parse/node');

const { batchQuery, getScheduledPushes } = require('../src/query');

describe('getScheduledPushes', () => {
  beforeEach((done) => {
    dropDB().then(done, done.fail);
  });

  // TODO add running + scheduled pushes
  it('should filter out immediate pushes', (done) => {
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

describe('batchQuery', () => {
  it('should produce paginated queries', () => {
    const where = { createdAt: { $gt: { __type: 'Date', iso: '2017-06-21T14:23:00.000Z' } } };
    const batchSize = 3;
    const count = 10;
    const batches = batchQuery(where, batchSize, count);

    expect(batches).toBeDefined('Batches should be an array');
    expect(batches.length).toBe(Math.ceil(count / batchSize), 'Incorrect number of batches');

    const queryResultLength = batches.reduce((sum, item) => item.limit + sum, 0);
    expect(queryResultLength).toEqual(3 * batches.length);
  });
});
