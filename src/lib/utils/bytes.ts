
export const getBytesFromBiByteString = (s: string) => {
  const [_number, [_unit]] = s.split(' ')
  return Number(_number) * (2 ** ('bkmgt'.indexOf(_unit.toLowerCase()) * 10))
}

export const getHumanReadableByteString = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return (
    `${
      parseFloat((bytes / Math.pow(k, i))
        .toFixed(decimals < 0 ? 0 : decimals))
    } ${
      ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'][i]
    }`
  )
}
