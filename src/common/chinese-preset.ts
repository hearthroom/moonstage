/** OpenCC 1.4.2's exact cn ↔ tw presets. Keep normalization and segmentation:
 * composing only from/cn + to/tw changes phrase boundaries and compatibility characters.
 * The full-preset equivalence test must pass whenever opencc-js is upgraded.
 */
import { ConverterBuilder } from 'opencc-js/core'
import fromCn from 'opencc-js/from/cn'
import fromTw from 'opencc-js/from/tw'
import toCn from 'opencc-js/to/cn'
import toTw from 'opencc-js/to/tw'
import compatibility from 'opencc-js/dict/CJK_Compatibility_Ideographs'
import stPhrases from 'opencc-js/dict/STPhrases'
import stRegional from 'opencc-js/dict/STPhrases_GeneratedFromRegionalPhrases'
import stCharacters from 'opencc-js/dict/STCharacters'
import tsPhrases from 'opencc-js/dict/TSPhrases'
import tsCharacters from 'opencc-js/dict/TSCharacters'
import twVariants from 'opencc-js/dict/TWVariants'
import twPhrases from 'opencc-js/dict/TWVariantsPhrases'
import twVariantsRev from 'opencc-js/dict/TWVariantsRev'
import twPhrasesRev from 'opencc-js/dict/TWVariantsRevPhrases'

export const preset = {
  from: { cn: fromCn, tw: fromTw },
  to: { cn: toCn, tw: toTw },
  configs: {
    s2tw: {
      normalizationChain: [[compatibility]],
      segmentation: [stPhrases, stRegional],
      conversionChain: [[stPhrases, stRegional, stCharacters], [twPhrases, twVariants]],
    },
    tw2s: {
      normalizationChain: [[compatibility]],
      segmentation: [tsPhrases],
      conversionChain: [[twPhrasesRev, twVariantsRev], [tsPhrases, tsCharacters]],
    },
  },
}
export const Converter = ConverterBuilder(preset)
