const Promise = require('bluebird');

const { getScheduledPushes, getActiveCampaigns } = require('./query');
const { createPushWorkItems } = require('./schedule');
const { addOffsetCounts, trackSent, markAsComplete } = require('./statusHandler');
const { createScheduledPush } = require('./campaign');
const { computeBucketValue } = require('./experiment');
const { flatten } = require('./util');

module.exports = {
  sendScheduledPushes(publisher, channel, now = new Date()) {
    return Promise.resolve(getScheduledPushes())
      // Pick only the incomplete pushes
      .filter((pushStatus) => markAsComplete(pushStatus, now).then((res) => !res))
      .map((pwi) => createPushWorkItems(pwi, now))
      .then(flatten)

      // We set the offsets to prevent resending in the next iteration
      .map((pwi) => addOffsetCounts(pwi.pushStatus.id, pwi.offset, now)
        .then(() => Promise.resolve(pwi)))
      .then(flatten)

      .each((pwi) => publisher.publish(channel, JSON.stringify(pwi)));
  },

  processPushBatch({ offset, query, body, pushStatus }, parseConfig, pushAdapter, now) {
    return Promise.resolve(parseConfig.database.find('_Installation', query.where, query))
      .filter((installation) => {
        const { distribution } = pushStatus;
        if (distribution) {
          const { min, max, salt } = distribution;
          const bucketValue = computeBucketValue(installation.id, salt);
          return bucketValue >= min && bucketValue <= max;
        }

        return true;
      })
      .map((installation) => pushAdapter.send({
        data: JSON.parse(body),
        where: { objectId: installation.id },
      }, [ installation ], pushStatus))
      .then((pushResults) => trackSent(pushStatus.objectId, offset, flatten(pushResults), parseConfig.database, now));
  },

  runPushCampaigns(now) {
    now = now || new Date();
    return Promise.resolve(getActiveCampaigns())
      .each((campaign) => createScheduledPush(campaign, now));
  },
};
