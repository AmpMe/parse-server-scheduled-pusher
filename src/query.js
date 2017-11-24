const Parse = require('parse/node');
const Promise = require('bluebird');
const { flatten, logger } = require('./util');

function batchQuery(where, batchSize, count, order = 'objectId') {
  const items = [];
  for (let skip = 0; skip < count; skip += batchSize) {
    if (skip > count) {
      skip = count;
    }

    items.push({
      where,
      limit: batchSize,
      skip,
      order,
    });
  }
  return items;
}

function sliceArray(array, size) {
  const results = [];
  while (array.length > 0) {
    results.push(array.slice(0, size));
    array = array.slice(size);
  }
  return results;
}

function getObjectIds(where, batchSize, firstElement) {
  const installationsQ = Parse.Query.fromJSON('_Installation', {
    where,
  });
  installationsQ.exists('deviceToken');
  installationsQ.limit(batchSize);
  installationsQ.select([ 'objectId' ]);
  installationsQ.ascending('objectId');
  if (firstElement) {
    installationsQ.greaterThan('objectId', firstElement);
  }
  return installationsQ.find({ useMasterKey: true });
}

function smartBatch(where, batchSize, firstElement, objects = []) {
  return getObjectIds(where, batchSize, firstElement).then((results) => {
    objects.push(results.map((res) => res.id));
    const last = results[results.length-1].id;
    console.log('Done: '+ results.length + ' ' +  last); // eslint-disable-line
    if (results.length === batchSize) {
      return smartBatch(where, batchSize, last, objects);
    }
  }).then(() => {
    if (objects.length > 0) {
      logger.info(`Creating about ${objects.length * batchSize}`);
    }
    return objects.reduce((memo, array) => {
      return memo.concat(sliceArray(array, 100));
    }, []);
  });
}

function batchPushWorkItem(pushWorkItem, batchSize = 100, querySize = 10000) {
  return smartBatch(pushWorkItem.query.where, querySize).then((slices) => {
    return slices.reduce((memo, array) => {
      return memo.concat(sliceArray(array, batchSize));
    }, []).map((slice) => {
      const batch = { objectId: { $in: slice } };
      return Object.assign({}, pushWorkItem, { query: { where: batch } });
    });
  });
}

function getScheduledPushes() {
  const pushStatusesQ = new Parse.Query('_PushStatus');
  pushStatusesQ.containedIn('status', [ 'scheduled' ]);

  return Promise.resolve(pushStatusesQ.count({ useMasterKey: true }))
    .then((count) =>
      batchQuery(pushStatusesQ.toJSON().where, 1000, count)
        .map((batch) => Parse.Query.fromJSON('_PushStatus', batch)))

    .mapSeries((query) => Promise.resolve(query.find({ useMasterKey: true }))
      .filter((pushStatus) => {
        // Filter out immediate pushes which are currently running
        if (pushStatus.get('status') === 'running' && !pushStatus.has('sentPerUTCOffset')) {
          logger.debug('Filtered out pushStatus', {
            type: 'immediate',
            pushStatus: pushStatus.toJSON(),
          });
          return false;
        }

        return true;
      }
    ))
    .then(flatten)
    .tap((pushStatuses) => {
      logger.info(`Found ${pushStatuses.length} potential pushes`, {
        pushStatuses: pushStatuses.map((p) => p.toJSON()),
      });
    });
}

function getPushesByCampaign(campaign) {
  const pushes = campaign.relation('pushes');
  return pushes.query()
    .descending('createdAt')
    .find({ useMasterKey: true });
}

function getActiveCampaigns() {
  logger.debug('Finding active campaigns');
  const campaignsQ = new Parse.Query('PushCampaign');
  return campaignsQ.equalTo('status', 'active')
    .find({ useMasterKey: true });
}

module.exports = {
  getActiveCampaigns,
  getScheduledPushes,
  getPushesByCampaign,
  batchQuery,
  batchPushWorkItem,
  smartBatch,
};
