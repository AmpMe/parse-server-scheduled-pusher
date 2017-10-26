const Promise = require('bluebird');

const { scheduleNextPush } = require('./campaign');
const { getScheduledPushes, getActiveCampaigns, batchPushWorkItem } = require('./query');
const { createPushWorkItems } = require('./schedule');
const { addOffsetCounts, markAsComplete } = require('./statusHandler');
const { flatten, logger } = require('./util');

module.exports = {
  sendScheduledPushes(publisher, channel, applicationId, now = new Date()) {
    return Promise.resolve(getScheduledPushes())
      .filter((pushStatus) => markAsComplete(pushStatus, now)
        // Pick only the incomplete pushes
        .then((res) => res === false))
      .tap((pushStatuses) => {
        logger.info('Incomplete pushes', { pushStatuses: pushStatuses.map((p) => p.toJSON()) });
      })

      .map((pushStatus) => createPushWorkItems(pushStatus, applicationId, now))
      .then(flatten)
      .tap((pushWorkItems) => {
        logger.info('Generated push work items', { pushWorkItems });
      })

      // We set the offsets to prevent resending in the next iteration
      .map((pwi) => addOffsetCounts(pwi.pushStatus, pwi.UTCOffset, now)
        .then(() => Promise.resolve(pwi)))
      .then(flatten)
      .each((pwi) => {
        // The PushWorker expects just the objectId
        pwi.pushStatus = { objectId: pwi.pushStatus.id };
      })

      .map((pwi) => batchPushWorkItem(pwi, 30))
      .then(flatten)
      .each((pwi) => {
        logger.info('Publishing push work items', pwi);
        const message = JSON.stringify(pwi);
        return publisher.publish(channel, message);
      });
  },

  runCampaigns(now = new Date()) {
    return Promise.resolve(getActiveCampaigns())
      .each((campaign) => scheduleNextPush(campaign, now));
  },
};
