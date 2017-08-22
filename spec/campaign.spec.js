const Config = require('parse-server/lib/Config');
const { dropDB } = require('parse-server-test-runner');

const { createScheduledPush, getNextPushTime } = require('../src/campaign');
const { getActiveCampaigns } = require('../src/query');

const { createCampaign, getCampaignWithPushes } = require('./util');

describe('getNextPushTime', () => {
  const now = new Date('2017-08-10T19:18:07.309Z');

  describe('Monthly', () => {
    describe('Today', () => {
      it('should return a time today', () => {
        const nextPushTime = getNextPushTime({
          interval: 'monthly',
          sendTime: '19:30:00',
          dayOfMonth: 10,
        }, now);

        expect(nextPushTime.toISOString()).toEqual('2017-08-10T19:30:00.000Z');
      });
    });

    describe('Day in the future', () => {
      it('should return a time in the future', () => {
        const nextPushTime = getNextPushTime({
          interval: 'monthly',
          sendTime: '19:30:00',
          dayOfMonth: 22,
        }, now);

        expect(nextPushTime.toISOString()).toEqual('2017-08-22T19:30:00.000Z');
      });
    });

    describe('Day of month has already past', () => {
      it('should return a time in the next month', () => {
        const nextPushTime = getNextPushTime({
          interval: 'monthly',
          sendTime: '19:30:00',
          dayOfMonth: 4,
        }, now);

        expect(nextPushTime.toISOString()).toEqual('2017-09-04T19:30:00.000Z');
      });
    });

    describe('Next year', () => {
      const now = new Date('2017-12-10T19:18:07.309Z');
      it('should return a time in January of next year', () => {
        const nextPushTime = getNextPushTime({
          interval: 'monthly',
          sendTime: '19:30:00',
          dayOfMonth: 4,
        }, now);

        expect(nextPushTime.toISOString()).toEqual('2018-01-04T19:30:00.000Z');
      });
    });
  });

  describe('Weekly', () => {
    describe('Later in the week', () => {
      it('should return Saturday, August 08, 2017', () => {
        const nextPushTime = getNextPushTime({
          interval: 'weekly',
          sendTime: '19:30:00',
          dayOfWeek: 6,
        }, now);

        expect(nextPushTime.toISOString()).toEqual('2017-08-12T19:30:00.000Z');
      });
    });

    describe('Today', () => {
      it('should return a time later today', () => {
        const nextPushTime = getNextPushTime({
          interval: 'weekly',
          sendTime: '19:30:00',
          dayOfWeek: 4,
        }, now);

        expect(nextPushTime.toISOString()).toEqual('2017-08-10T19:30:00.000Z');
      });
    });

    describe('Too late for today', () => {
      it('should return a time in the next week', () => {
        const nextPushTime = getNextPushTime({
          interval: 'weekly',
          sendTime: '19:10:00',
          dayOfWeek: 4,
        }, now);

        expect(nextPushTime.toISOString()).toEqual('2017-08-17T19:10:00.000Z');
      });
    });

    describe('Next week', () => {
      it('should return Tuesday, August 15, 2017', () => {
        const nextPushTime = getNextPushTime({
          interval: 'weekly',
          sendTime: '19:30:00',
          dayOfWeek: 2,
        }, now);

        expect(nextPushTime.toISOString()).toEqual('2017-08-15T19:30:00.000Z');
      });
    });

    describe('Next month', () => {
      const now = new Date('2017-08-31T19:18:07.309Z');
      it('should return Tuesday, September 5, 2017', () => {
        const nextPushTime = getNextPushTime({
          interval: 'weekly',
          sendTime: '19:30:00',
          dayOfWeek: 2,
        }, now);

        expect(nextPushTime.toISOString()).toEqual('2017-09-05T19:30:00.000Z');
      });
    });
  });

  describe('Daily', () => {
    it('should return return a time for today', () => {
      const nextPushTime = getNextPushTime({
        interval: 'daily',
        sendTime: '19:30:00',
      }, now);

      expect(nextPushTime.toISOString()).toEqual('2017-08-10T19:30:00.000Z');
    });
  });
});

describe('createScheduledPush', () => {
  const now = new Date('2017-08-10T19:18:07.309Z');

  let pushCampaign;
  let config;

  beforeAll((done) => {
    config = new Config('test', '/1');
    createCampaign(config, now)
      .then((_pushCampaign) => pushCampaign = _pushCampaign)
      .then(done, done.fail);
  });

  afterAll((done) => dropDB().then(done, done.fail));

  it('should create a _PushStatus', () => {
    expect(pushCampaign.get('data')).toBeDefined();
    expect(pushCampaign.get('pushes')).toBeDefined();

    const pushStatus = pushCampaign.get('pushes')[0].toJSON();
    delete pushStatus.__type;
    delete pushStatus.objectId;

    expect(pushStatus).toEqual({
      pushTime: '2017-08-10T23:00:00.000Z',
      query: '"{\\"user\\":{\\"__type\\":\\"Pointer\\",\\"className\\":\\"_User\\",\\"objectId\\":\\"0K1kfQnyj6\\"}}"',
      // eslint-disable-next-line max-len
      payload: '{"alert":"Someone you follow started a party!","uri":"ampme://party?code=1499866378692&notification_id=AbaINdDnqs","url":"ampme://party?code=1499866378692&notification_id=AbaINdDnqs","notification_id":"AbaINdDnqs","type":"partyStarted"}',
      source: 'parse-scheduled-pusher',
      status: 'scheduled',
      pushHash: '7f6d833b879163d9558545f722719edc',
      createdAt: '2017-08-10T19:18:07.309Z',
      updatedAt: '1970-01-01T00:00:00.000Z',
      ACL: {},
    });
  });

  describe('running twice before the next interval', () => {
    it('should not create a duplicate scheduled push', (done) => {
      createScheduledPush(pushCampaign, config.database, now)
        .then((res) => expect(res).toBeNull())
        .then(() => getCampaignWithPushes(pushCampaign))
        .then((pushCampaign) => expect(pushCampaign.get('pushes').length).toEqual(1))
        .then(done, done.fail);
    });
  });
});

describe('getActiveCampaigns', () => {
  it('should work', (done) => {
    createCampaign()
      .then(getActiveCampaigns)
      .then(([ pushCampaign ]) => expect(pushCampaign).toBeDefined())
      .then(done, done.fail);
  });
});
