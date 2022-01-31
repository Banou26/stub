import { NWaligner, SWaligner } from 'seqalign'


// https://github.com/aceakash/string-similarity
// https://stackoverflow.com/questions/653157/a-better-similarity-ranking-algorithm-for-variable-length-strings
// Sørensen–Dice coefficient
export const diceCompare = (first: string, second: string) => {
	first = first.replace(/\s+/g, '')
	second = second.replace(/\s+/g, '')

	if (first === second) return 1 // identical or empty
	if (first.length < 2 || second.length < 2) return 0 // if either is a 0-letter or 1-letter string

	const firstBigrams = new Map()
	for (let i = 0; i < first.length - 1; i++) {
		const bigram = first.substring(i, i + 2)
		const count = firstBigrams.has(bigram)
			? firstBigrams.get(bigram) + 1
			: 1

		firstBigrams.set(bigram, count)
	}

	let intersectionSize = 0
	for (let i = 0; i < second.length - 1; i++) {
		const bigram = second.substring(i, i + 2)
		const count = firstBigrams.has(bigram)
			? firstBigrams.get(bigram)
			: 0

		if (count > 0) {
			firstBigrams.set(bigram, count - 1)
			intersectionSize++
		}
	}

	return (2.0 * intersectionSize) / (first.length + second.length - 2)
}

// Mushoku Tensei
// Mushoku Tensei: Isekai Ittara Honki Dasu
// Mushoku Tensei: Jobless Reincarnation

// [Erai-raws] Mushoku Tensei - Isekai Ittara Honki Dasu 2nd Season - 12 END [v0][1080p][Multiple Subtitle][E500D275].mkv
// Mushoku Tensei: Isekai Ittara Honki Dasu
export const getAlignedStringParts = (str: string, str2: string): string[] => {
	const customAligner = SWaligner({
		inDelScore: -3,
		gapSymbol: '~',
	})
	
	const customResult = customAligner.align(str, str2)

	return customResult
}

console.clear()
console.log(getAlignedStringParts(
	'Mushoku Tensei: Isekai Ittara Honki Dasu',
	'Mushoku Tensei: Jobless Reincarnation'
))
// console.log(getAlignedStringParts('Mushoku Tensei: Isekai Ittara Honki Dasu', 'Mushoku Tensei: Jobless Reincarnation'))
