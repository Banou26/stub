
export const getBytesFromBiByteString = (s: string) => {
  const [_number, [_unit]] = s.split(' ')
  return Number(_number) * (2 ** ('bkmgt'.indexOf(_unit.toLowerCase()) * 10))
}

export const getHumanReadableByteString = (bytes, compact?: boolean) => {
  if (bytes === 0) return `0 ${compact ? 'B' : 'bytes'}`
  const k = 1000
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  const result =
    new Intl.NumberFormat(
      'en-US',
      {
        unit: ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte', 'petabyte'][i],
        notation: 'standard',
        style: 'unit',
        unitDisplay: 'short',
        maximumSignificantDigits: 2
      }
    )
    .format(bytes / Math.pow(k, i))

  if (compact) return i > 1000 ? `${Number(result.replaceAll('byte', '')) / 1000}kB` : result

  return result
}
