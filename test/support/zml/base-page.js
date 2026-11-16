import { pageRequest } from '../world.mjs'

export const BasePage = (options) => ({
  ...options,
  request: (data) => pageRequest(data),
})
