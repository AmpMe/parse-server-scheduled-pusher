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

function getScheduledPushes() {
  const pushStatusesQ = new Parse.Query('_PushStatus');
  return pushStatusesQ.equalTo('status', 'scheduled')
    .find({ useMasterKey: true });
}

module.exports = {
  batchQuery,
  getScheduledPushes,
};
