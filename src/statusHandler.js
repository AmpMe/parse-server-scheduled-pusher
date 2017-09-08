module.exports = {
  addOffsetCounts(pushStatusId, offset, database, now) {
    now = now || new Date();
    const update = { updatedAt: now };
    update[`sentPerUTCOffset.${offset}`] = { __op: 'Increment', amount: 0 };
    update[`failedPerUTCOffset.${offset}`] = { __op: 'Increment', amount: 0 };

    return database.update('_PushStatus', { objectId: pushStatusId }, update);
  },

  trackSent(pushStatusId, offset, pushResults, database, now) {
    now = now || new Date();

    let numSent = 0;
    let numFailed = 0;
    for (const { transmitted } of pushResults) {
      if (transmitted) {
        numSent++;
      } else {
        numFailed++;
      }
    }

    const update = { updatedAt: now };
    update[`sentPerUTCOffset.${offset}`] = { __op: 'Increment', amount: numSent };
    update[`failedPerUTCOffset.${offset}`] = { __op: 'Increment', amount: numFailed };

    return database.update('_PushStatus', { objectId: pushStatusId }, update);
  },

  markAsComplete(pushStatus, database, now) {
    now = now || new Date();

    const ttl = now - 24 * 60 * 60 * 1000;
    if (+pushStatus.get('pushTime') < ttl) {
      const sentPerUTCOffset = pushStatus.get('sentPerUTCOffset') || {};
      let sentSum = 0;
      for (const offset of Object.keys(sentPerUTCOffset)) {
        sentSum += sentPerUTCOffset[offset];
      }
      const status = sentSum === 0 ? 'failed' : 'succeeded';

      return database.update('_PushStatus', { objectId: pushStatus.id }, { status, updatedAt: now })
        .then(() => true);
    }
    return Promise.resolve(false);
  },
};
