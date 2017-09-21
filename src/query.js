const Parse = require('parse/node');

const { log } = require('./util');

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

function batchPushWorkItem(pushWorkItem, batchSize = 100) {
  const installationsQ = Parse.Query.fromJSON('_Installation', {
    where: pushWorkItem.query.where,
  });

  return installationsQ.count({ useMasterKey: true })
    .then((count) => (
      batchQuery(pushWorkItem.query.where, batchSize, count)
        .map((batch) => Object.assign({}, pushWorkItem, { query: batch }))
    ));
}

function getScheduledPushes() {
  const pushStatusesQ = new Parse.Query('_PushStatus');
  pushStatusesQ.containedIn('status', [ 'scheduled', 'running' ]);
  pushStatusesQ.limit(1000);
  pushStatusesQ.addDescending('createdAt'); // Newest to oldest

  return pushStatusesQ.find({ useMasterKey: true })
    .then((pushStatuses) => {
      log.info({ pushStatuses: pushStatuses.map((p) => p.toJSON()) }, 'Found scheduled pushes');
      return pushStatuses.filter((pushStatus) => {
        // Filter out immediate pushes which are currently running
        if (pushStatus.get('status') === 'running' && !pushStatus.has('sentPerUTCOffset')) {
          log.trace({ pushStatus: pushStatus.toJSON() }, 'Filtered out pushStatus');
          return false;
        }

        return true;
      });
    });
}

module.exports = { getScheduledPushes, batchQuery, batchPushWorkItem };
