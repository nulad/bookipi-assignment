function getSaleStatus({ now, startTime, endTime, remainingStock }) {
  if (now < startTime) {
    return 'upcoming';
  }

  if (now > endTime) {
    return 'ended';
  }

  if (remainingStock <= 0) {
    return 'sold_out';
  }

  return 'active';
}

module.exports = {
  getSaleStatus,
};
