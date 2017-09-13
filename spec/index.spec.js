const Promise = require('bluebird');
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

  describe('in local time', () => {
    it('should work', (done) => {
      const parseConfig = new Config('test', '/1');

      const now = new Date('2017-08-24T17:27:43.105Z');

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
        push_time: '2017-08-24T14:27:40.000',
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
        name: 'A',
        ratio: .51,
        data: {
          alert: 'Test push A',
          uri: 'foo://bar/baz?qux=1',
          url: 'foo://bar/baz?qux=1',
        },
      },
      {
        name: 'A',
        ratio: .49,
        data: {
          alert: 'Test push B',
          uri: 'foo://bar/baz?qux=1',
          url: 'foo://bar/baz?qux=1',
        },
      },
    ]);

    const now = new Date('2017-08-24T17:27:43.105Z');

    // All the installations are in Brazil.
    // Brazil is -03:00
    campaign.set('sendTime', '14:27:44');

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

    mockPushState.sent = 0;
    campaign.save({ useMasterKey: true })
      .then(() => runPushCampaigns(parseConfig, now))
      .then(() => Promise.delay(2000))
      .then(() => sendScheduledPushes(parseConfig, publisher, now))
      .then(pwiReceivePromise)
      .then(() => campaign.fetch({ useMasterKey: true }))
      .then((campaign) => {
        const pushes = campaign.get('pushes');
        expect(pushes).toBeDefined();
        expect(pushes.length).toBeDefined();
        expect(pushes.length).toBe(2);

        const q = new Parse.Query('_PushStatus');
        q.containedIn('objectId', pushes.map((p) => p.id));
        return q.find({ useMasterKey: true });
      })
      .then((pushes) => {
        pushes.forEach((p) => {
          expect(p.get('distribution')).toBeDefined();
          expect(p.get('status')).toBe('scheduled');
          expect(p.get('sentPerUTCOffset')[180]).toBeGreaterThan(0);
          expect(p.get('failedPerUTCOffset')[180]).toBe(0);
        });
        expect(mockPushState.sent).toBe(installations.length);
      })
      .then(done, done.fail);
  });
});
