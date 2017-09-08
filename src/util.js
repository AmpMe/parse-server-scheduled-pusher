const flatten = (arr) => arr.reduce((a, b) => (
  Array.isArray(b) ? a.concat(flatten(b))
    : a.concat(b)
), []);

module.exports = { flatten };