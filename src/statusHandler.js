const Parse = require('parse/node');
const { logger } = require('./util');

module.exports = {
  markAsComplete(pushStatus, now) {
    if (!(now instanceof Date)) {
      throw new Error('now must be defined');
    }

    const ttl = now - 24 * 60 * 60 * 1000;
    logger.debug('Completion ttl', { ttl });

    // If push was supposed to be sent more than 24 hours ago.
    if (+new Date(pushStatus.get('pushTime')) < ttl) {
      const sentPerUTCOffset = pushStatus.get('sentPerUTCOffset') || {};

      let sentSum = 0;
      for (const offset of Object.keys(sentPerUTCOffset)) {
        sentSum += sentPerUTCOffset[offset];
      }

      // NOTE: The status is only updated after 24 hours.
      // This may need to be fixed.
      const numSent = pushStatus.get('numSent');
      if (!isNaN(numSent)) {
        sentSum += numSent;
      }

      const status = sentSum === 0 ? 'failed' : 'succeeded';
      pushStatus.set('status', status);
      return pushStatus.save(null, { useMasterKey: true })
        .then(() => true);
    }
    return Promise.resolve(false);
  },

  addOffsetCounts(pushStatus, offset) {
    logger.info('Initializing offset counts', Object.assign({ offset }, pushStatus.toJSON()));

    if (
      typeof offset === 'undefined' && // Everyone gets it at the same time.
      pushStatus.get('status') === 'scheduled'
    ) {
      // pushStatus.set('status', 'running');
      pushStatus.increment('count', 0);
      pushStatus.increment('numSent', 0);
      return pushStatus.save(null, { useMasterKey: true })
        .then(() => ({ updated: true }));
    } else if (typeof offset !== 'undefined') {
      // Parse JS SDK doesn't allow nested increment.
      // So we have to call the rest endpoint directly.
      const update = { };
      update[`sentPerUTCOffset.${offset}`] = { __op: 'Increment', amount: 0 };
      update[`failedPerUTCOffset.${offset}`] = { __op: 'Increment', amount: 0 };

      return Parse._request(
        'PUT',
        `classes/_PushStatus/${pushStatus.id}`,
        update,
        { useMasterKey: true }
      ).then(() => ({ updated: true }));
    }

    return Promise.resolve({ updated: false });
  },
};
