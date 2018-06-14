const Promise = require('bluebird');

const { scheduleNextPush } = require('./campaign');
const { getScheduledPushes, getActiveCampaigns } = require('./query');
const { createPushWorkItems } = require('./schedule');
const { addOffsetCounts, markAsComplete } = require('./statusHandler');
const { flatten, logger } = require('./util');
const { queryResults, sender } = require('./batch');

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 300;

module.exports = {
  async sendScheduledPushes(publisher, channel, applicationId, now = new Date()) {
    const pushWorkItems = await Promise.resolve(getScheduledPushes())
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
        .then(() => Promise.resolve(pwi)));

    const publish = (msg) => publisher.publish(channel, msg);
    for (const pwi of pushWorkItems) {
      const sendPushWorkItems = sender(publish, pwi, BATCH_SIZE);
      await (new Promise((resolve, reject) => {
        const stream = queryResults(pwi.query.where);
        stream.pipe(sendPushWorkItems, { end: true });
        stream.on('end', resolve);
        stream.on('error', reject);
      }));
    }

    return pushWorkItems;
  },

  runCampaigns(now = new Date()) {
    return Promise.resolve(getActiveCampaigns())
      .tap((activeCampaigns) => logger.info(`Found ${activeCampaigns.length} active campaigns`, { activeCampaigns }))
      .map((campaign) => scheduleNextPush(campaign, now));
  },
};
