const Promise = require('bluebird');
const moment = require('moment');
const Parse = require('parse/node');
const Config = require('parse-server/lib/Config');
const { master } = require('parse-server/lib/Auth');
const { create } = require('parse-server/lib/rest');
const { dropDB } = require('parse-server-test-runner');

const { sendScheduledPushes, runPushCampaigns } = require('../src');
const { PushCampaign } = require('../src/query');

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

describe('runPushCampaigns', () => {
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

    const campaign = new PushCampaign();
    campaign.set('status', 'active');
    campaign.set('interval', 'daily');
    campaign.set('query', {});
    campaign.set('data', {
      alert: 'Test push',
      uri: 'ampme://me/followers?notification_id=1',
      url: 'ampme://me/followers?notification_id=1',
    });

    const now = moment();
    now.add(1, 'second');
    campaign.set('sendTime', now.format('HH:mm:ss'));

    campaign.save({ useMasterKey: true })
      .then(() => runPushCampaigns(parseConfig))
      .then(() => Promise.delay(2000))
      .then(() => sendScheduledPushes(parseConfig, pushAdapter))
      .then(() => campaign.fetch({ useMasterKey: true }))
      .then((campaign) => {
        const pushes = campaign.get('pushes');
        expect(pushes).toBeDefined();
        expect(pushes.length).toBeDefined();
        expect(pushes.length).toBe(1);

        const q = new Parse.Query('_PushStatus');
        return q.get(pushes[0].id, { useMasterKey: true });
      })
      .then(done, done.fail);
  });
});
