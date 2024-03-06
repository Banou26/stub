const seasons = ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const
export const getSeason = (d: Date) => seasons[Math.floor((d.getMonth() / 12) * 4) % 4]
