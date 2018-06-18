const Parse = require('parse/node');
const { dropDB } = require('parse-server-test-runner');

const { scheduleNextPush, getNextPushTime, deleteDuplicatePushes } = require('../src/campaign');
const { getActiveCampaigns, getPushesByCampaign } = require('../src/query');

const { createCampaign, stripTimezone } = require('./util');

describe('getNextPushTime', () => {
  // Thursday, August 10
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

    describe('Too late for today in UTC', () => {
      it('should still return the time for today', () => {
        const now = new Date('2017-08-10T23:30:00.000Z');
        const nextPushTime = getNextPushTime({
          interval: 'weekly',
          sendTime: '19:30:00',
          dayOfWeek: 4,
        }, now);

        expect(nextPushTime.toISOString()).toEqual('2017-08-10T19:30:00.000Z');
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

describe('scheduleNextPush', () => {
  const now = new Date('2017-08-10T19:18:07.309Z');

  let pushCampaign;

  beforeAll((done) => {
    createCampaign(now)
      .then((_pushCampaign) => pushCampaign = _pushCampaign)
      .then(done, done.fail);
  });

  afterAll((done) => dropDB().then(done, done.fail));

  it('should create a _PushStatus', (done) => {
    return scheduleNextPush(pushCampaign, now)
      .then((nextPush) => {
        expect(nextPush).not.toBeNull();
        expect(pushCampaign.get('nextPush').id).toBeDefined();
        expect(pushCampaign.get('nextPush').id).toEqual(nextPush.id);
      })
      .then(() => getPushesByCampaign(pushCampaign))
      .then(([ pushStatus ]) => {
        expect(pushStatus).toBeDefined();

        pushStatus = pushStatus.toJSON();
        delete pushStatus.__type;
        delete pushStatus.objectId;
        delete pushStatus.createdAt;
        delete pushStatus.updatedAt;

        expect(pushStatus).toEqual({
          pushTime: '2017-08-10T23:00:00.000',
          // eslint-disable-next-line max-len
          query: '{"user":{"__type":"Pointer","className":"_User","objectId":"0K1kfQnyj6"}}',
          // eslint-disable-next-line max-len
          payload: '{"alert":"ALERT!!","uri":"foo://bar?baz=qux","url":"foo://bar?baz=qux","notification_id":"AbaINdDnqs","type":"foo"}',
          source: 'parse-server-scheduled-pusher',
          status: 'scheduled',
          pushHash: '6d0001cb0d8a13f0f3dffd30700dded5',
        });
      })
      .then(done, done.fail);
  });

  describe('running twice before the next interval', () => {
    it('should not create a duplicate scheduled push', (done) => {
      scheduleNextPush(pushCampaign, now)
        .then((res) => expect(res).toBeNull())
        .then(() => getPushesByCampaign(pushCampaign))
        .then((pushes) => expect(pushes.length).toEqual(1))
        .then(done, done.fail);
    });
  });
});

describe('getActiveCampaigns', () => {
  it('should work', (done) => {
    const now = new Date('2017-08-10T19:18:07.309Z');
    createCampaign(now)
      .then(getActiveCampaigns)
      .then(([ pushCampaign ]) => expect(pushCampaign).toBeDefined())
      .then(done, done.fail);
  });
});

describe('deleteDuplicatePushes', () => {
  async function campaignWithPushes(numPushes) {
    const now = new Date('2017-08-10T19:18:07.309Z');
    const campaign = await createCampaign(now);
    const pushes = campaign.relation('pushes');

    for (let i=0; i<numPushes; i++) {
      const push = new Parse.Object('_PushStatus');
      await push.save({
        pushTime: stripTimezone(now),
        status: 'scheduled',
        query: '{}',
        payload: '{"alert":"alert!"}',
        title: 'title',
        numSent: 0,
        source: 'rest',
        pushHash: '1328bee6e66a1c8f6fa5d5546812e671',
      }, { useMasterKey: true });

      pushes.add(push);
    }

    await campaign.save(null, { useMasterKey: true });
    return campaign;
  }

  it('should delete pushes of a PushCampaign with the same pushTime', async () => {
    const campaign = await campaignWithPushes(2);

    const pushStatuses = await getPushesByCampaign(campaign);
    expect(pushStatuses.length).toEqual(2);

    expect((await deleteDuplicatePushes(campaign, pushStatuses)).length).toEqual(1);
    expect((await getPushesByCampaign(campaign)).length).toEqual(1);
  });

  it('should not do anything if there are no duplicates', async () => {
    const campaign = await campaignWithPushes(1);

    const pushStatuses = await getPushesByCampaign(campaign);
    expect(pushStatuses.length).toEqual(1);

    expect((await deleteDuplicatePushes(campaign, pushStatuses)).length).toEqual(1);
    expect((await getPushesByCampaign(campaign)).length).toEqual(1);
  });

  it('should not do anything if there are no pushes at all', async () => {
    const campaign = await campaignWithPushes(0);

    const pushStatuses = await getPushesByCampaign(campaign);
    expect(pushStatuses.length).toEqual(0);

    expect((await deleteDuplicatePushes(campaign, pushStatuses)).length).toEqual(0);
    expect((await getPushesByCampaign(campaign)).length).toEqual(0);
  });
});
