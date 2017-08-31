const crypto = require('crypto');

const md5 = (str) => crypto.createHash('md5').update(str).digest('hex');

const nibbles = 7; // from `x` as described below
const DISTRIBUTION_MAX = Math.pow(16, nibbles);

module.exports = {
  DISTRIBUTION_MAX,

  computeBucketValue(objectId, salt) {
    /*
       Javascript has 2^53 integer precision.
       x is the max number of "digits" we can safely take from the hex string
       2^53 = 16^x
       x = (53 * log(2)) / (log(16))
       x = 13.25

       Verify by running:
        console.log(Number.MAX_SAFE_INTEGER.toString(16).length);
        // 14

       We want this number to be safely used everywhere, so we'll limit the LHS to less than 32 bits (30  bits).
       2^30 = 16^x
       x = (30 * log(2)) / (log(16))
       x = 7.5

       // Range of values value. `x` is rounded down
       [0, 16^7]
    */
    const hash = md5(`${objectId}${salt}`);
    const value = hash.substring(0, nibbles);
    return parseInt(value, 16);
  },
};
