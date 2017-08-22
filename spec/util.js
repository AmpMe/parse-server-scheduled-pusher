const Parse = require('parse/node');

const { PushCampaign } = require('../src/query');
const Config = require('parse-server/lib/Config');

const { createScheduledPush } = require('../src/campaign');

function createCampaign(config = new Config('test', '/1'), now = new Date('2017-08-10T19:18:07.309Z')) {
  const pushCampaign = new PushCampaign();
  pushCampaign
    .set('status', 'active')
    .set('interval', 'daily')
    .set('sendTime', '23:00:00')
    .set('query', '{"user":{"__type":"Pointer","className":"_User","objectId":"0K1kfQnyj6"}}')
    .set('data', {
      alert: 'Someone you follow started a party!',
      uri: 'ampme://party?code=1499866378692&notification_id=AbaINdDnqs',
      url: 'ampme://party?code=1499866378692&notification_id=AbaINdDnqs',
      notification_id: 'AbaINdDnqs', type: 'partyStarted',
    });

  return pushCampaign.save(null, { useMasterKey: true })
    .then((pushCampaign) => createScheduledPush(pushCampaign, config.database, now))
    .then(getCampaignWithPushes);
}

function getCampaignWithPushes(pushCampaign) {
  const q = new Parse.Query(PushCampaign);
  return q.include('pushes')
    .get(pushCampaign.id, { useMasterKey: true });
}


module.exports = {
  createCampaign,
  getCampaignWithPushes,
};
