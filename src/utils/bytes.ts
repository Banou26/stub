
export const getBytesFromBiByteString = (s: string) => {
  const [_number, [_unit]] = s.split(' ')
  return Number(_number) * (2 ** ('bkmgt'.indexOf(_unit.toLowerCase()) * 10))
}

export const getHumanReadableByteString = (bytes) => {
  if (bytes === 0) return '0 bytes'
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return (
    new Intl.NumberFormat(
      'en-US',
      {
        unit: ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte', 'petabyte'][i],
        notation: 'standard',
        style: 'unit',
        unitDisplay: 'short'
      }
    )
    .format(bytes / Math.pow(k, i))
  )
}
