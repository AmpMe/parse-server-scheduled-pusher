const Promise = require('bluebird');
const moment = require('moment');
const Parse = require('parse/node');
const Config = require('parse-server/lib/Config');
const { EventEmitterMQ } = require('parse-server/lib/Adapters/MessageQueue/EventEmitterMQ');

const { sendScheduledPushes, processPushBatch, runPushCampaigns } = require('../src');
const { PushCampaign } = require('../src/query');

const { setupInstallations, installations } = require('./util');

const { state: mockPushState, adapter: pushAdapter } = require('./mockPushAdapter');

// Integration tests
describe('Sending scheduled pushes', () => {
  beforeAll(setupInstallations);

  it('should work', (done) => {
    const parseConfig = new Config('test', '/1');

    const now = new Date('2017-08-24T17:27:43.105Z');
    const pushTime = new Date(new Date('2017-08-24T14:27:43.105Z') - 5);

    const publisher = EventEmitterMQ.createPublisher();
    const subscriber = EventEmitterMQ.createSubscriber();

    const pwiReceivePromise = new Promise((resolve, reject) => {
      subscriber.subscribe('pushWorkItem');
      subscriber.on('message', (channel, rawMsg) => {
        const pwi = JSON.parse(rawMsg);
        processPushBatch(pwi, parseConfig, pushAdapter, now)
          .then(resolve, reject);
      });
    });

    Parse.Push.send({
      push_time: pushTime,
      data: {
        alert: 'Alert!!!!!',
        uri: 'foo://bar?baz=qux',
        url: 'foo://bar?baz=qux',
        type: 'bar',
      },
      where: {},
    }, { useMasterKey: true })
      .then(() => sendScheduledPushes(parseConfig, publisher, now))
      .then(() => pwiReceivePromise)
      .then(() => {
        expect(mockPushState.sent).toBe(installations.length);
      })
      .then(done, done.fail);
  });
});

describe('runPushCampaigns', () => {
  beforeAll(setupInstallations);

  it('should work', (done) => {
    const parseConfig = new Config('test', '/1');

    const campaign = new PushCampaign();
    campaign.set('status', 'active');
    campaign.set('interval', 'daily');
    campaign.set('query', {});
    campaign.set('variants', [
      {
        percent: 51,
        data: {
          alert: 'Test push A',
          uri: 'foo://bar/baz?qux=1',
          url: 'foo://bar/baz?qux=1',
        },
      },
      {
        percent: 49,
        data: {
          alert: 'Test push B',
          uri: 'foo://bar/baz?qux=1',
          url: 'foo://bar/baz?qux=1',
        },
      },
    ]);

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
        expect(pushes.length).toBe(2);

        const q = new Parse.Query('_PushStatus');
        return q.get(pushes[0].id, { useMasterKey: true });
      })
      .then(done, done.fail);
  });
});
