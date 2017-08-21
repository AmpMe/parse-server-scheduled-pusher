const Promise = require('bluebird');
const Parse = require('parse/node');
const Config = require('parse-server/lib/Config');
const { master } = require('parse-server/lib/Auth');
const { create } = require('parse-server/lib/rest');
const { dropDB } = require('parse-server-test-runner');

const { sendScheduledPushes } = require('../src');

const installations = require('./fixtures/installations.json');
// Remove special Parse fields like '_created_at' and '_updated_at'
Object.keys(installations).forEach((key) => {
  if (key.startsWith('_')) {
    delete installations[key];
  }
});

const { state: mockPushState, adapter: pushAdapter } = require('./mockPushAdapter');

// Integration tests
describe('sendScheduledPushes', () => {
  beforeAll((done) => {
    const config = new Config('test', '/1');
    dropDB()
      .then(() => Promise.all(installations.map((i) => create(config, master(config), '_Installation', {
        deviceToken: i.deviceToken,
        deviceType: i.deviceType,
        timeZone: i.timeZone,
      }))))

      .then(done, done.fail);
  });

  it('should work', (done) => {
    const parseConfig = new Config('test', '/1');

    Parse.Push.send({
      data: {
        alert: 'Alert!!!!!',
        uri: 'foo://bar?baz=qux',
        url: 'foo://bar?baz=qux',
        type: 'bar',
      },
      where: {},
    }, { useMasterKey: true })
      .then(() => sendScheduledPushes(parseConfig, pushAdapter))
      .then(() => Promise.delay(() => {
        expect(mockPushState.sent).toBe(installations.length);
      }, 20))
      .then(done, done.fail);
  });
});

