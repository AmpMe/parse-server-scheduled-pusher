const Promise = require('bluebird');

const { scheduleNextPush } = require('./campaign');
const { getScheduledPushes, getActiveCampaigns, batchPushWorkItem } = require('./query');
const { createPushWorkItems } = require('./schedule');
const { addOffsetCounts, markAsComplete } = require('./statusHandler');
const { flatten, logger } = require('./util');

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 300;

module.exports = {
  sendScheduledPushes(publisher, channel, applicationId, now = new Date()) {
    return Promise.resolve(getScheduledPushes())
      .filter((pushStatus) => markAsComplete(pushStatus, now)
        // Pick only the incomplete pushes
        .then((res) => res === false))
      .tap((pushStatuses) => {
        logger.debug('Incomplete pushes', { pushStatuses: pushStatuses.map((p) => p.toJSON()) });
      })

      .map((pushStatus) => createPushWorkItems(pushStatus, applicationId, now))
      .then(flatten)
      .tap((pushWorkItems) => {
        if (pushWorkItems && pushWorkItems.length > 0) {
          logger.debug('Generated push work items', { pushWorkItems });
        }
      })

      // We set the offsets to prevent resending in the next iteration
      .map((pwi) => addOffsetCounts(pwi.pushStatus, pwi.UTCOffset, now)
        .then(() => Promise.resolve(pwi)))
      .then(flatten)
      .each((pwi) => {
        // The PushWorker expects just the objectId
        pwi.pushStatus = { objectId: pwi.pushStatus.id };
      })

      .map((pwi) =>
        batchPushWorkItem(pwi, BATCH_SIZE)
          .catch((err) => {
            logger.error('Error while batching push work items', { err: JSON.stringify(err, Object.getOwnPropertyNames(err)), pushWorkItem: pwi } );
            return [];
          })
      )
      .then(flatten)
      .tap((pushWorkItemBatches) => {
        const first = pushWorkItemBatches[0];
        if (!first) {
          return;
        }
        logger.info('Batched push work items', {
          expectedBatchSize: BATCH_SIZE,
          totalBatches: pushWorkItemBatches.length,
          pushWorkItems: pushWorkItemBatches,
        });
      })
      .map((pwi) => {
        const message = JSON.stringify(pwi);
        publisher.publish(channel, message);
        return { channel, message };
      });
  },

  runCampaigns(now = new Date()) {
    return Promise.resolve(getActiveCampaigns())
      .tap((activeCampaigns) => logger.info(`Found ${activeCampaigns.length} active campaigns`, { activeCampaigns }))
      .map((campaign) => scheduleNextPush(campaign, now));
  },
};
