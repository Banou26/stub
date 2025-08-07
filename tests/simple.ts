import { expect } from 'chai'

export const simple = {
  'basic tests': {
    'should work with chai': async () => {
      expect(1 + 1).to.equal(2)
      expect(true).to.be.true
    },

    'should handle async operations': async () => {
      const promise = Promise.resolve(42)
      const result = await promise
      expect(result).to.equal(42)
    },

    'should test types': async () => {
      const str: string = 'hello'
      const num: number = 123
      const bool: boolean = true
      
      expect(typeof str).to.equal('string')
      expect(typeof num).to.equal('number')
      expect(typeof bool).to.equal('boolean')
    }
  }
}
