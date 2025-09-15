export const ellipseText = (text: string, length: number) =>
  text.length > length
    ? `${text.slice(0, text.indexOf(' ', length)).replace(/[,.]$/, '')}...`
    : text
