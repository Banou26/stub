import Bencode from 'bencode'
import { arr2text } from 'uint8-util'

const END_OF_TYPE = 0x65 // 'e'
Bencode.decode.dictionary = function () {
  Bencode.decode.position++
  let hasNonAscii = false
  const map = new Map()
  const obj = {}
  while (Bencode.decode.data[Bencode.decode.position] !== END_OF_TYPE) {
    const key = Bencode.decode.buffer()
    const value = Bencode.decode.next()
    if (!hasNonAscii && key.some((v) => v > 127)) hasNonAscii = true
    map.set(key, value)
    obj[arr2text(key)] = value
  }
  Bencode.decode.position++
  return hasNonAscii ? map : obj
}
