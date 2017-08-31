const crypto = require('crypto');
const { DISTRIBUTION_MAX, computeBucketValue, getDistributionRange } = require('../src/experiment');

// From https://github.com/parse-community/parse-server/blob/51d2dd92cb8c3484d3643ee8d0a864a72554dac5/src/cryptoUtils.js
// Returns a new random alphanumeric string of the given size.
//
// Note: to simplify implementation, the result has slight modulo bias,
// because chars length of 62 doesn't divide the number of all bytes
// (256) evenly. Such bias is acceptable for most cases when the output
// length is long enough and doesn't need to be uniform.
function randomString(size) {
  if (size === 0) {
    throw new Error('Zero-length randomString is useless.');
  }
  const chars = ('ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
    'abcdefghijklmnopqrstuvwxyz' +
    '0123456789');
  let objectId = '';
  const bytes = crypto.randomBytes(size);
  for (let i = 0; i < bytes.length; ++i) {
    objectId += chars[bytes.readUInt8(i) % chars.length];
  }
  return objectId;
}

// Returns a new random alphanumeric string suitable for object ID.
function newObjectId(size = 10) {
  return randomString(size);
}

// From https://en.wikibooks.org/wiki/Algorithm_Implementation/Pseudorandom_Numbers/Chi-Square_Test#Java
function isUniform(values) {
  const r = DISTRIBUTION_MAX;
  const ratio = values.length / r;

  const frequencies = {};
  for (const value of values) {
    if (frequencies[value]) {
      frequencies[value] = frequencies[value] + 1;
    } else {
      frequencies[value] = 1;
    }
  }

  let chiSquare = 0;
  for (const key of Object.keys(frequencies)) {
    const f = frequencies[key] - ratio;
    chiSquare += f * f;
  }
  chiSquare /= (values.length / r);

  return Math.abs(chiSquare - r) <= 2 * Math.sqrt(r);
}

describe('experiment', () => {
  describe('DISTRIBUTION_MAX', () => {
    it('should be constant', () => {
      expect(DISTRIBUTION_MAX).toBe(268435456);
    });
  });

  describe('computeBucketValue', () => {
    it('should be spread uniformly', () => {
      function computeValues() {
        const ids = [];
        for (let i = 0; i < 10000; i++) {
          ids.push(newObjectId());
        }
        return ids.map(computeBucketValue);
      }

      const numTries = 50;
      const timesUniform = (new Array(numTries)).fill(0).map(computeValues)
        .filter(isUniform)
        .length;

      expect(timesUniform).toBeGreaterThanOrEqual(40);
      expect(timesUniform).toBeLessThanOrEqual(numTries);
    });
  });

  describe('getDistributionRange', () => {
    fit('should work for a single variant', () => {
      const variants = [ { percent: 100 } ];
      const { min, max } = getDistributionRange(variants, 0);

      expect(min).toBe(0);
      expect(max).toBe(DISTRIBUTION_MAX);
    });

    fit('should work for 2 variants', () => {
      const variants = [ { percent: 51 }, { percent: 49 } ];
      const { min, max } = getDistributionRange(variants, 1);
      expect(min).toBe(136902083);
      expect(max).toBe(DISTRIBUTION_MAX);
    });
  });
});
