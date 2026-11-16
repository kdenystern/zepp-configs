// Loaded with `node --import`. Lets the app code run under Node by resolving:
//   @zos/*         -> ./zos/*.js   (watch runtime mocks)
//   @zeppos/zml/*  -> ./zml/*.js   (messaging library mocks)
//   './lib/config' -> './lib/config.js' (the Zeus bundler allows no extension)
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = new URL('.', import.meta.url)

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@zos/')) {
      return { url: new URL(`./zos/${specifier.slice(5)}.js`, here).href, shortCircuit: true }
    }
    if (specifier.startsWith('@zeppos/zml/')) {
      return { url: new URL(`./zml/${specifier.slice(12)}.js`, here).href, shortCircuit: true }
    }
    if (/^\.\.?\//.test(specifier) && context.parentURL && !/\.(m?js|json)$/.test(specifier)) {
      const candidate = new URL(specifier + '.js', context.parentURL)
      if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})
