const Parse = require('parse/node');

function batchQuery(where, batchSize, count, order = 'createdAt') {
  const items = [];
  for (let skip = 0; skip < count; skip += batchSize) {
    items.push({
      where,
      limit: batchSize,
      skip,
      order,
    });
  }
  return items;
}

function getScheduledPushes(now) {
  now = now || new Date();

  const pushStatusesQ = new Parse.Query('_PushStatus');
  return pushStatusesQ.containedIn('status', [ 'scheduled', 'running' ])
    .then((pushStatuses) => pushStatuses.filter((pushStatus) => {
      // TODO note.
      if (pushStatus.get('status') === 'running' && !pushStatus.get('sentPerUTCOffset')) {
        return false;
      }

      return true;
    }))
    .find({ useMasterKey: true });
}

const PushCampaign = Parse.Object.extend('PushCampaign');
function getActiveCampaigns() {
  const campaignsQ = new Parse.Query(PushCampaign);
  campaignsQ.equalTo('status', 'active');
  return campaignsQ.find({ useMasterKey: true });
}

module.exports = {
  PushCampaign,
  batchQuery,
  getActiveCampaigns,
  getScheduledPushes,
};
